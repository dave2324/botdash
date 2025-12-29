/**
 * Implementation for channel verification in the TelegramBot class
 * These methods should be added to the bot.js file
 */

// Add this to the TelegramBot class after the start method
async setupChannelVerificationScheduler() {
  const pool = require('./config/database');
  
  // Function to determine when to run next verification
  const scheduleNextVerification = async () => {
    try {
      // Get verification frequency from settings
      const settingsResult = await pool.query(
        "SELECT value FROM settings WHERE key = 'channel_verification_frequency_hours'"
      );
      const verificationFrequencyHours = parseInt(settingsResult.rows[0]?.value) || 24;
      
      // Convert to milliseconds
      return verificationFrequencyHours * 60 * 60 * 1000;
    } catch (error) {
      logger.error('Error getting verification frequency setting:', error);
      return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
  };
  
  // Function to run verification
  const runVerification = async () => {
    try {
      logger.info('Starting scheduled channel membership verification...');
      const stats = await this.verifyAllChannelMemberships();
      logger.info(`Scheduled verification completed: ${stats.verified} verified, ${stats.left} left, ${stats.errors} errors`);
      
      // Schedule next verification
      const nextInterval = await scheduleNextVerification();
      setTimeout(runVerification, nextInterval);
      
      logger.info(`Next channel verification scheduled in ${nextInterval / (1000 * 60 * 60)} hours`);
    } catch (error) {
      logger.error('Error in scheduled channel verification:', error);
      // Retry in 1 hour if there was an error
      setTimeout(runVerification, 60 * 60 * 1000);
    }
  };
  
  // Start the scheduler with initial delay of 1 minute
  setTimeout(async () => {
    const interval = await scheduleNextVerification();
    logger.info(`Initial channel verification scheduled in 1 minute, then every ${interval / (1000 * 60 * 60)} hours`);
    setTimeout(runVerification, 60 * 1000);
  }, 1000);
}

// Add this method to check if a user is still a member of a specific Telegram channel
async checkUserChannelMembership(userId, channelIdentifier) {
  try {
    if (!this.isClientReady()) {
      await this.ensureConnection();
    }
    
    // Get channel entity
    const entity = await this.client.getEntity(channelIdentifier);
    if (!entity) {
      throw new Error('Channel not found or bot does not have access');
    }
    
    try {
      // Try to get the participant info
      const participant = await this.client.invoke(new Api.channels.GetParticipant({
        channel: entity,
        participant: parseInt(userId)
      }));
      
      // If we can get participant info without error, user is in the channel
      return !!participant && !!participant.participant;
    } catch (error) {
      // If we get "User not found" error, it means the user is not in the channel
      logger.info(`User ${userId} is not a member of channel ${entity.title || channelIdentifier}`);
      return false;
    }
  } catch (error) {
    logger.error(`Error checking membership for user ${userId} in channel ${channelIdentifier}:`, error);
    // In case of error, assume the user is still in the channel to avoid false suspensions
    return true;
  }
}

// Add this method to verify all users' channel memberships
async verifyAllChannelMemberships() {
  const pool = require('./config/database');
  const stats = { verified: 0, left: 0, errors: 0 };
  
  try {
    if (!this.isClientReady()) {
      await this.ensureConnection();
    }
    
    // Get verification frequency from settings
    const settingsResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'channel_verification_frequency_hours'"
    );
    const verificationFrequencyHours = parseInt(settingsResult.rows[0]?.value) || 24;
    
    // Find users who need verification (their next_channel_verification is in the past or null)
    const usersResult = await pool.query(`
      SELECT DISTINCT u.id, u.username, u.first_name
      FROM telegram_users u
      JOIN task_progress tp ON u.id = tp.user_id
      WHERE tp.task_type = 'channel_join'
        AND tp.status = 'completed'
        AND (u.next_channel_verification IS NULL OR u.next_channel_verification < NOW())
      LIMIT 100 -- Process in batches to avoid overload
    `);
    
    for (const user of usersResult.rows) {
      try {
        // Get all completed channel tasks for this user
        const channelsResult = await pool.query(`
          SELECT tp.task_id, tc.name, tc.title, tc.link
          FROM task_progress tp
          JOIN telegram_channels tc ON tp.task_id = tc.id
          WHERE tp.user_id = $1
            AND tp.task_type = 'channel_join'
            AND tp.status = 'completed'
        `, [user.id]);
        
        let userLeftAnyChannel = false;
        
        // Check membership for each channel
        for (const channel of channelsResult.rows) {
          try {
            const channelName = channel.name;
            const isMember = await this.checkUserChannelMembership(user.id, channelName);
            
            // Record verification in log table
            await pool.query(`
              INSERT INTO channel_membership_verifications 
              (user_id, channel_id, verification_time, is_member)
              VALUES ($1, $2, NOW(), $3)
            `, [user.id, channel.task_id, isMember]);
            
            if (!isMember) {
              // Update task_progress to indicate user has left
              await pool.query(`
                UPDATE task_progress 
                SET membership_status = 'left', 
                    last_verified_at = NOW() 
                WHERE user_id = $1 AND task_id = $2 AND task_type = 'channel_join'
              `, [user.id, channel.task_id]);
              
              userLeftAnyChannel = true;
              stats.left++;
            } else {
              // Update last verification timestamp
              await pool.query(`
                UPDATE task_progress 
                SET last_verified_at = NOW(), 
                    membership_status = 'active' 
                WHERE user_id = $1 AND task_id = $2 AND task_type = 'channel_join'
              `, [user.id, channel.task_id]);
            }
            
            stats.verified++;
          } catch (error) {
            logger.error(`Error verifying channel membership for user ${user.id}, channel ${channel.task_id}:`, error);
            stats.errors++;
          }
        }
        
        // Update user's verification status
        const nextVerification = new Date();
        nextVerification.setHours(nextVerification.getHours() + verificationFrequencyHours);
        
        await pool.query(`
          UPDATE telegram_users 
          SET last_channel_verification = NOW(),
              next_channel_verification = $1,
              has_left_channels = $2,
              earning_tasks_suspended = $2,
              tasks_suspended_reason = CASE WHEN $2 = TRUE THEN 'You have left Telegram channels you were paid to join. Please rejoin to continue earning.' ELSE NULL END
          WHERE id = $3
        `, [nextVerification, userLeftAnyChannel, user.id]);
        
        // If user left a channel, try to send them a notification
        if (userLeftAnyChannel) {
          try {
            // Try to send a direct message to the user
            await this.client.sendMessage(parseInt(user.id), {
              message: `⚠️ Channel Membership Alert ⚠️\n\nYou have left one or more Telegram channels you were paid to join. Your ability to earn points has been temporarily suspended. Please rejoin the channels to continue earning.`
            });
          } catch (msgError) {
            logger.error(`Failed to send notification message to user ${user.id}:`, msgError);
          }
        }
        
      } catch (userError) {
        logger.error(`Error processing verification for user ${user.id}:`, userError);
        stats.errors++;
      }
    }
    
    logger.info(`Channel membership verification completed: ${stats.verified} verifications, ${stats.left} users left channels, ${stats.errors} errors`);
    return stats;
  } catch (error) {
    logger.error('Error in verifyAllChannelMemberships:', error);
    throw error;
  }
}