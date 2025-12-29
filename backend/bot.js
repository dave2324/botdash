const { TelegramClient } = require('telegram');
const { StoreSession } = require('telegram/sessions');
const { NewMessage } = require('telegram/events');
const { Api } = require('telegram');
const path = require('path');
const { logger } = require('./config/logger');

class TelegramBot {
  constructor(apiId, apiHash, botToken) {
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.botToken = botToken;
    this.client = null;
    this.sessionFolder = 'bot_sessions';
    this.isReady = false;
  }

  async start() {
    try {
      // Create a logger that only logs errors
      const customLogger = {
        log: () => {},
        info: () => {},
        warn: (message) => logger.warn(message),
        error: (message) => logger.error(message),
        debug: () => {},
        canSend: () => true // Fix for MTProtoSender error
      };

      // Initialize the client with a Store Session (saves to files automatically)
      this.client = new TelegramClient(
        new StoreSession(this.sessionFolder), // Store session for persistence
        this.apiId,
        this.apiHash,
        {
          connectionRetries: Infinity, // Keep retrying connection
          connectionRetryDelay: 1000, // Delay between retries in ms
          autoReconnect: true, // Enable auto reconnection
          baseLogger: customLogger, // Use custom logger to track errors
          useWSS: true, // Use secure WebSocket
          maxReconnects: Infinity // Keep trying to reconnect
        }
      );

      // Start the client and sign in as a bot
      await this.client.start({
        botAuthToken: this.botToken
      });

      this.isReady = true;
      logger.info('Bot started successfully');
      
      // Setup channel membership verification scheduler
      this.setupChannelVerificationScheduler();

      // Register message handlers
      this.registerHandlers();
      
      // Start connection monitoring
      this.startConnectionMonitoring();
      
      // Initial connection verification
      await this.ensureConnection();
    } catch (error) {
      logger.error('Error starting bot:', error);
      throw error;
    }
  }

  isClientReady() {
    return this.isReady && this.client !== null;
  }

  async ensureConnection() {
    try {
      if (!this.client) {
        logger.error('Client is null, attempting to reinitialize...');
        await this.start();
        return;
      }

      if (!this.client.connected) {
        logger.warn('Client disconnected, attempting to reconnect...');
        await this.client.connect();
        
        // Verify the connection by making a simple API call
        try {
          await this.client.getMe();
          logger.info('Bot reconnected successfully');
        } catch (error) {
          logger.error('Failed to verify bot connection:', error);
          // Force a new connection attempt
          await this.client.disconnect();
          await this.client.connect();
        }
      }
    } catch (error) {
      logger.error('Error in ensureConnection:', error);
      // Schedule a retry
      setTimeout(() => this.ensureConnection(), 5000);
    }
  }

  // Start a periodic connection check
  startConnectionMonitoring() {
    // Check connection every 30 seconds
    setInterval(() => {
      if (this.isReady && (!this.client || !this.client.connected)) {
        logger.warn('Detected disconnected state in periodic check');
        this.ensureConnection();
      }
    }, 30000);
  }

  // Setup scheduled verification of channel memberships
  async setupChannelVerificationScheduler() {
    const pool = require('./config/database');
    
    // First ensure the required column exists
    try {
      logger.info('Checking if next_channel_verification column exists in telegram_users table...');
      
      // Check if the column exists
      const columnCheckResult = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'telegram_users' 
        AND column_name = 'next_channel_verification'
      `);
      
      if (columnCheckResult.rowCount === 0) {
        logger.info('next_channel_verification column does not exist, adding it now...');
        
        // Add the missing column
        await pool.query(`
          ALTER TABLE telegram_users
          ADD COLUMN IF NOT EXISTS next_channel_verification TIMESTAMP;
          
          -- Update existing users to have a next verification time
          UPDATE telegram_users
          SET next_channel_verification = NOW() + INTERVAL '24 hours'
          WHERE next_channel_verification IS NULL;
        `);
        
        logger.info('Added next_channel_verification column to telegram_users table');
      } else {
        logger.info('next_channel_verification column exists, continuing...');
      }
    } catch (error) {
      logger.error('Error checking/adding column next_channel_verification:', error);
      // Continue anyway, we'll try to run the verification
    }
    
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

  async getChannelInfo(channelIdentifier) {
    try {
      // Try to get the channel entity
      const entity = await this.client.getEntity(channelIdentifier);
      
      if (!entity) {
        throw new Error('Channel not found or bot does not have access');
      }
      
      // Check if the bot has admin rights
      try {
        const fullChannel = await this.client.invoke(new Api.channels.GetParticipant({
          channel: entity.id,
          participant: 'me'
        }));
        
        if (!fullChannel || !fullChannel.participant) {
          throw new Error('Bot is not a member of the channel');
        }
        
        // Check if the bot is an admin
        const isAdmin = fullChannel.participant.className === 'ChannelParticipantAdmin' ||
                       fullChannel.participant.className === 'ChannelParticipantCreator';
        
        return {
          id: entity.id.toString(),
          title: entity.title,
          username: entity.username,
          isPrivate: !entity.username, // If no username, it's a private channel
          isAdmin: isAdmin,
          accessHash: entity.accessHash?.toString() || null
        };
      } catch (error) {
        logger.error('Error checking bot admin status:', error);
        throw new Error('Could not verify bot permissions in channel');
      }
    } catch (error) {
      logger.error('Error getting channel info:', error);
      throw error;
    }
  }
  
  /**
   * Check if a user is still a member of a specific Telegram channel
   * @param {number|string} userId - Telegram user ID
   * @param {string} channelIdentifier - Channel username, ID, or link
   * @returns {Promise<boolean>} - true if user is a member, false otherwise
   */
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
  
  /**
   * Verify all users' channel memberships that need verification based on configured frequency
   * @returns {Promise<{verified: number, left: number, errors: number}>} - Verification stats
   */
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
  }  async processReferral(userId, referralCode, newUserInfo = {}) {
    try {
      const pool = require('./config/database');
      
      // Ensure userId is a proper number (not a string)
      const userIdNum = parseInt(userId, 10);
      
      if (isNaN(userIdNum)) {
        logger.error('Invalid user ID:', userId);
        return { success: false, message: 'Invalid user ID' };
      }

      // Check if referral code exists
      const referrerResult = await pool.query(
        'SELECT id, username, first_name, last_name FROM telegram_users WHERE referral_code = $1',
        [referralCode]
      );

      if (referrerResult.rows.length === 0) {
        return { success: false, message: 'Invalid referral code' };
      }

      const referrer = referrerResult.rows[0];
      const referrerId = parseInt(referrer.id, 10);
      
      // Don't allow self-referrals
      if (referrerId === userIdNum) {
        return { success: false, message: 'Cannot use your own referral code' };
      }
      
      // Check if this user has already been referred
      const existingReferralResult = await pool.query(
        'SELECT id FROM referrals WHERE referred_id = $1',
        [userIdNum]
      );
      
      if (existingReferralResult.rows.length > 0) {
        return { success: false, message: 'User already has a referrer' };
      }
      
      // Get referred user info
      const userResult = await pool.query(
        'SELECT username, first_name, last_name FROM telegram_users WHERE id = $1',
        [userIdNum]
      );
      
      if (userResult.rows.length === 0) {
        return { success: false, message: 'User not found in database' };
      }
      
      const user = userResult.rows[0];
      
      // Add referral record and award points
      const REFERRAL_POINTS = 30;
      
      // Add points to referrer
      const pointsResult = await pool.query(
        'SELECT add_points_to_user($1, $2) as new_points',
        [referrerId, REFERRAL_POINTS]
      );
      
      const newPoints = pointsResult.rows[0].new_points;
      
      // Create referral record
      await pool.query(
        'INSERT INTO referrals (referrer_id, referred_id, points_awarded) VALUES ($1, $2, $3)',
        [referrerId, userIdNum, REFERRAL_POINTS]
      );
      
      // Send notification to referrer if we have a client
      if (this.client) {
        try {
          const userDisplayName = user.first_name || user.username || 'A new user';
          const notificationMessage = `🎉 Referral Bonus!\n\n${userDisplayName} has joined using your referral link!\n\nYou've received ${REFERRAL_POINTS} points as a reward. Your total points are now ${newPoints}.`;
          
          await this.client.sendMessage(referrerId, {
            message: notificationMessage
          });
          
          logger.info(`Sent referral notification to user ${referrerId}`);
        } catch (msgError) {
          logger.error('Error sending referral notification:', msgError);
          // Continue even if notification fails
        }
      }

      return { 
        success: true, 
        points: REFERRAL_POINTS,
        referrer: {
          id: referrerId,
          username: referrer.username,
          first_name: referrer.first_name,
          last_name: referrer.last_name
        }
      };
    } catch (error) {
      logger.error('Error processing referral:', error);
      return { success: false, message: 'Error processing referral' };
    }
  }

  async getUserReferralLink(userId) {
    try {
      const pool = require('./config/database');

      // Ensure userId is a proper number (not a string)
      const userIdNum = parseInt(userId, 10);
      
      if (isNaN(userIdNum)) {
        logger.error('Invalid user ID:', userId);
        return { success: false, message: 'Invalid user ID' };
      }

      // Get user's referral code
      const result = await pool.query(
        'SELECT referral_code FROM telegram_users WHERE id = $1',
        [userIdNum]
      );
      
      if (result.rows.length === 0 || !result.rows[0].referral_code) {
        return { success: false, message: 'No referral code found for this user' };
      }
      
      const referralCode = result.rows[0].referral_code;
      const botUsername = process.env.BOT_USERNAME || '';
      
      if (!botUsername) {
        return { success: false, message: 'BOT_USERNAME not set in environment' };
      }
      
      const referralLink = `https://t.me/${botUsername}?start=ref${referralCode}`;
      
      return { success: true, referralCode, referralLink };
    } catch (error) {
      logger.error('Error getting referral link:', error);
      return { success: false, message: 'Error retrieving referral link' };
    }
  }

  async registerUser(sender) {
    try {
      const pool = require('./config/database');
      
      // Make sure we're using the raw numeric ID
      const senderId = typeof sender.id === 'object' ? sender.id.toString() : sender.id;
      const userIdNum = parseInt(senderId, 10);
      
      if (isNaN(userIdNum)) {
        logger.error('Invalid user ID:', senderId);
        return { success: false, message: 'Invalid user ID' };
      }
      
      // Generate a random referral code if needed
      const crypto = require('crypto');
      const generateReferralCode = (length = 8) => {
        const buffer = crypto.randomBytes(length);
        return buffer.toString('base64')
          .replace(/[+/=]/g, '')
          .substring(0, length)
          .toUpperCase();
      };

      // Ensure user exists in database
      const userResult = await pool.query(
        'INSERT INTO telegram_users (id, username, first_name, last_name, language_code, last_active) ' +
        'VALUES ($1, $2, $3, $4, $5, NOW()) ' +
        'ON CONFLICT (id) DO UPDATE SET ' +
        'username = EXCLUDED.username, ' +
        'first_name = EXCLUDED.first_name, ' +
        'last_name = EXCLUDED.last_name, ' +
        'language_code = EXCLUDED.language_code, ' +
        'last_active = NOW() ' +
        'RETURNING id, points, referral_code',
        [
          userIdNum, 
          sender.username || '', 
          sender.firstName || '', 
          sender.lastName || '', 
          sender.langCode || 'en'
        ]
      );
      
      const userData = userResult.rows[0];
      
      // If there's no referral code yet, generate one
      if (!userData.referral_code) {
        let referralCode;
        let isCodeUnique = false;
        
        // Keep generating codes until we find a unique one
        while (!isCodeUnique) {
          referralCode = generateReferralCode();
          
          // Check if the code already exists
          const existingCode = await pool.query(
            'SELECT COUNT(*) FROM telegram_users WHERE referral_code = $1',
            [referralCode]
          );
          
          if (parseInt(existingCode.rows[0].count) === 0) {
            isCodeUnique = true;
          }
        }
        
        // Update user with the new referral code
        await pool.query(
          'UPDATE telegram_users SET referral_code = $1 WHERE id = $2 RETURNING referral_code',
          [referralCode, userIdNum]
        );
        
        userData.referral_code = referralCode;
      }
      
      return { success: true, user: userData };
    } catch (error) {
      logger.error('Error registering user:', error);
      return { success: false, message: 'Error registering user' };
    }
  }

  registerHandlers() {
    // Add connection monitoring
    this.client.addEventHandler((update) => {
      if (update.className === 'UpdateConnectionState') {
        if (update.state.className === 'ConnectionNotConnected') {
          logger.warn('Bot disconnected, attempting to reconnect...');
          this.ensureConnection();
        }
      }
    });

    // Handle /start command with error recovery
    this.client.addEventHandler(async ({ message }) => {
      if (!message || !message.message) return; // Guard against invalid messages
      
      if (message.message.startsWith('/start')) {
        try {
          const sender = await message.getSender();
          
          // Register user in database
          const registrationResult = await this.registerUser(sender);
          
          let welcomeMessage = `👋 Welcome to MelaTech, ${sender.firstName}!

🎮 Here's what you can do:
• Play games and earn points
• Complete daily tasks
• Refer friends for bonus points
• Withdraw your earnings

Use our Mini App to get started! 🚀`;

          if (registrationResult.success) {
            // Add points info to the welcome message
            const points = registrationResult.user.points || 0;
            welcomeMessage += `\n\nYour current points: ${points}`;
          }

                    // Check for referral code
          const startParams = message.message.split(' ');
          if (startParams.length > 1 && startParams[1].startsWith('ref')) {
            const referralCode = startParams[1].substring(3); // Remove 'ref' prefix
            // Make sure we're using the raw numeric ID
            const senderId = typeof sender.id === 'object' ? sender.id.toString() : sender.id;
            
            const userInfo = {
              username: sender.username || '',
              first_name: sender.firstName || '',
              last_name: sender.lastName || ''
            };
            
            const referralResult = await this.processReferral(senderId, referralCode, userInfo);
            
            if (referralResult.success) {
              const referrerName = referralResult.referrer.first_name || referralResult.referrer.username || 'Someone';
              welcomeMessage += `\n\n🎉 You were referred by ${referrerName}. They received ${referralResult.points} points!`;
            }
          }

          // Using the correct keyboard markup format
          await this.client.sendMessage(message.chatId, {
            message: welcomeMessage,
            buttons: new Api.ReplyInlineMarkup({
              rows: [
                new Api.KeyboardButtonRow({
                  buttons: [
                    new Api.KeyboardButtonWebView({
                      text: '🎮 Open Mini App',
                      url: process.env.MINI_APP_URL || 'https://url.com'
                    })
                  ]
                })
              ]
            })
          });
        } catch (error) {
          logger.error('Error handling start command:', error);
          // Fallback to plain message without buttons if markup fails
          try {
            const sender = await message.getSender();
            const fallbackMessage = `👋 Welcome to MelaTech, ${sender.firstName}!

🎮 Visit our Mini App at: ${process.env.MINI_APP_URL || 'https://t.me/miniapp'}`;

            await this.client.sendMessage(message.chatId, { message: fallbackMessage });
          } catch (fallbackError) {
            logger.error('Fallback message also failed:', fallbackError);
          }
        }
      }
      
      // Handle /help command
      if (message.message.startsWith('/help')) {
        try {
          const helpMessage = `📚 **MelaTech Help**

*Available Commands:*
/start - Start the bot and get welcome message
/help - Show this help message
/points - Check your current points
/referral - Get your referral link to invite friends
/tasks - View available tasks (coming soon)

📣 *Referral Program:*
• Share your referral link with friends
• When they join using your link, you earn 30 points!
• Use the /referral command to get your link

Need more help? Contact our support team.`;

          await this.client.sendMessage(message.chatId, { 
            message: helpMessage,
            parseMode: 'markdown'
          });
        } catch (error) {
          logger.error('Error handling help command:', error);
        }
      }

      // Handle /points command
      if (message.message.startsWith('/points')) {
        try {
          const sender = await message.getSender();
          // Make sure we're using the raw numeric ID
          const senderId = typeof sender.id === 'object' ? sender.id.toString() : sender.id;
          
          const pool = require('./config/database');
          
          // Get user's points
          const userResult = await pool.query(
            'SELECT points FROM telegram_users WHERE id = $1',
            [parseInt(senderId, 10)]
          );
          
          let pointsMessage = "";
          
          if (userResult.rows.length > 0) {
            const points = userResult.rows[0].points || 0;
            pointsMessage = `💰 You currently have ${points} points.`;
            
            if (points === 0) {
              pointsMessage += "\n\nComplete tasks in the Mini App to earn more!";
            } else if (points < 50) {
              pointsMessage += "\n\nKeep going! Refer friends to earn more points quickly.";
            } else if (points >= 50 && points < 200) {
              pointsMessage += "\n\nYou're doing great! Keep completing tasks to earn rewards.";
            } else {
              pointsMessage += "\n\nImpressive! You're one of our top users.";
            }
          } else {
            pointsMessage = "You are not registered yet. Please use /start to register.";
          }
          
          await this.client.sendMessage(message.chatId, {
            message: pointsMessage
          });
        } catch (error) {
          logger.error('Error handling points command:', error);
          await this.client.sendMessage(message.chatId, {
            message: "Sorry, there was an error checking your points. Please try again later."
          });
        }
      }

      // Handle /referral command
      if (message.message.startsWith('/referral')) {
        try {
          const sender = await message.getSender();
          // Make sure we're using the raw numeric ID
          const senderId = typeof sender.id === 'object' ? sender.id.toString() : sender.id;
          const referralInfo = await this.getUserReferralLink(senderId);
          
          if (referralInfo.success) {
            const referralMessage = `🔗 Your Referral Link:
${referralInfo.referralLink}

Your Referral Code: ${referralInfo.referralCode}

Share this link with friends and earn 30 points for each new user who joins!`;
            
            await this.client.sendMessage(message.chatId, {
              message: referralMessage
            });
          } else {
            await this.client.sendMessage(message.chatId, {
              message: `⚠️ ${referralInfo.message || 'Unable to generate referral link at this time.'} Please try again later.`
            });
          }
        } catch (error) {
          logger.error('Error handling referral command:', error);
          await this.client.sendMessage(message.chatId, {
            message: "⚠️ Error generating your referral link. Please try again later."
          });
        }
      }
    }, new NewMessage({}));
  }

  async stop() {
    if (this.client) {
      await this.client.disconnect();
      console.log('Bot stopped');
    }
  }
}

// Create bot instance for the main thread
let botInstance = null;

const createBot = async () => {
  if (!botInstance) {
    botInstance = new TelegramBot(
      process.env.API_ID,
      process.env.API_HASH,
      process.env.BOT_TOKEN
    );
    await botInstance.start();
  }
  return botInstance;
};

module.exports.createBot = createBot; // Also export createBot for new usage
module.exports.TelegramBot = TelegramBot; // Export TelegramBot class
