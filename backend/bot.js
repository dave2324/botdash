const TelegramBotApi = require('node-telegram-bot-api');
const path = require('path');
const { logger } = require('./config/logger');

class TelegramBot {
  constructor(botToken) {
    this.botToken = botToken;
    this.bot = null;
    this.isReady = false;
    this.botUsername = null; // cached from getMe()
  }

  async start() {
    try {
      if (!this.botToken) {
        logger.warn('BOT_TOKEN is not set. Skipping bot startup.');
        return;
      }

      // Initialize standard Bot API client with polling
      this.bot = new TelegramBotApi(this.botToken, {
        polling: true
      });

      // Try to detect and cache bot username so we don't require BOT_USERNAME env
      try {
        const me = await this.bot.getMe();
        this.botUsername = me && me.username ? me.username : null;
        if (this.botUsername) {
          logger.info('Detected bot username from Telegram API', { username: this.botUsername });
        } else {
          logger.warn('Bot username missing in getMe() response; referral links will omit @username');
        }
      } catch (meError) {
        logger.warn('Failed to fetch bot username via getMe(); proceeding without cached username', meError);
        this.botUsername = null;
      }

      this.isReady = true;
      logger.info('Bot started successfully (Bot API polling mode)');

      // Setup channel membership verification scheduler
      this.setupChannelVerificationScheduler();

      // Register message handlers
      this.registerHandlers();
    } catch (error) {
      logger.error('Error starting bot:', error);
      throw error;
    }
  }

  isClientReady() {
    return this.isReady && this.bot !== null;
  }

  async ensureConnection() {
    // node-telegram-bot-api handles reconnection internally in polling mode,
    // so this method simply checks that the bot instance exists.
    if (!this.bot) {
      logger.error('Bot instance is null, attempting to reinitialize...');
      await this.start();
    }
  }

  // Start a periodic connection check
  startConnectionMonitoring() {
    // For Bot API polling, reconnection is handled by the library,
    // but we keep this method for compatibility and logging.
    setInterval(() => {
      if (!this.bot) {
        logger.warn('Bot instance missing in periodic check, restarting...');
        this.start();
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
      const entity = await this.bot.getChat(channelIdentifier);
      
      if (!entity) {
        throw new Error('Channel not found or bot does not have access');
      }
      
      // Check if the bot has admin rights
      try {
        const fullChannel = await this.bot.getChatAdministrators(channelIdentifier);
        
        if (!fullChannel || !fullChannel.find(admin => admin.user.id === this.bot.options.credentials.id)) {
          throw new Error('Bot is not a member of the channel');
        }
        
        // Check if the bot is an admin
        const isAdmin = fullChannel.find(admin => admin.user.id === this.bot.options.credentials.id).status === 'creator' ||
                       fullChannel.find(admin => admin.user.id === this.bot.options.credentials.id).status === 'administrator';
        
        return {
          id: entity.id.toString(),
          title: entity.title,
          username: entity.username,
          isPrivate: !entity.username, // If no username, it's a private channel
          isAdmin: isAdmin,
          accessHash: null
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

      try {
        // For Bot API, use getChatMember with channel username or ID
        const member = await this.bot.getChatMember(channelIdentifier, parseInt(userId));

        // If we get a valid status that is not "left" or "kicked", user is considered a member
        const status = member && member.status;
        return status && status !== 'left' && status !== 'kicked';
      } catch (error) {
        // If we get an error like "user not found" or similar, log and treat as not a member
        logger.info(`User ${userId} is not a member of channel ${channelIdentifier}`);
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
              await this.bot.sendMessage(parseInt(user.id, 10),
                '⚠️ Channel Membership Alert ⚠️\n\nYou have left one or more Telegram channels you were paid to join. Your ability to earn points has been temporarily suspended. Please rejoin the channels to continue earning.');
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
      if (this.bot) {
        try {
          const userDisplayName = user.first_name || user.username || 'A new user';
          const notificationMessage = `🎉 Referral Bonus!\n\n${userDisplayName} has joined using your referral link!\n\nYou've received ${REFERRAL_POINTS} points as a reward. Your total points are now ${newPoints}.`;
          
          await this.bot.sendMessage(referrerId, notificationMessage);
          
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

      // Prefer cached username from getMe; fall back to BOT_USERNAME if present; otherwise no link
      const envBotUsername = process.env.BOT_USERNAME || '';
      const botUsernameSource = this.botUsername || envBotUsername || '';

      let referralLink = null;
      if (botUsernameSource) {
        referralLink = `https://t.me/${botUsernameSource}?start=ref${referralCode}`;
      }

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
      const senderId = sender.id;
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
          sender.first_name || '', 
          sender.last_name || '', 
          sender.language_code || 'en'
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
    if (!this.bot) return;

    // Handle /start command with error recovery
    this.bot.onText(/^\/start(?:\s+(.*))?/, async (msg, match) => {
      try {
        const sender = msg.from;

        // Register user in database
        const registrationResult = await this.registerUser(sender);

        let welcomeMessage = `👋 Welcome to Dashbot, ${sender.first_name || ''}!

🎮 Here's what you can do:
• Play games and earn points
• Complete daily tasks
• Refer friends for bonus points
• Withdraw your earnings`;

        if (registrationResult.success) {
          // Add points info to the welcome message
          const points = registrationResult.user.points || 0;
          welcomeMessage += `\n\nYour current points: ${points}`;
        }

        // Check for referral code in /start params
        const startParam = match && match[1] ? match[1].trim() : '';
        if (startParam && startParam.startsWith('ref')) {
          const referralCode = startParam.substring(3); // Remove 'ref' prefix

          const userInfo = {
            username: sender.username || '',
            first_name: sender.first_name || '',
            last_name: sender.last_name || ''
          };

          const referralResult = await this.processReferral(sender.id, referralCode, userInfo);

          if (referralResult.success) {
            const referrerName =
              referralResult.referrer.first_name ||
              referralResult.referrer.username ||
              'Someone';
            welcomeMessage += `\n\n🎉 You were referred by ${referrerName}. They received ${referralResult.points} points!`;
          }
        }

        await this.bot.sendMessage(msg.chat.id, welcomeMessage);
      } catch (error) {
        logger.error('Error handling start command:', error);
        // Fallback to plain message without buttons if markup fails
        try {
          const sender = msg.from;
          const fallbackMessage = `👋 Welcome to Dashbot, ${sender.first_name || ''}!`;

          await this.bot.sendMessage(msg.chat.id, fallbackMessage);
        } catch (fallbackError) {
          logger.error('Fallback message also failed:', fallbackError);
        }
      }
    });

    // Handle /help command
    this.bot.onText(/^\/help/, async (msg) => {
      try {
        const helpMessage = `📚 *Dashbot Help*

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

        await this.bot.sendMessage(msg.chat.id, helpMessage, {
          parse_mode: 'Markdown'
        });
      } catch (error) {
        logger.error('Error handling help command:', error);
      }
    });

    // Handle /points command
    this.bot.onText(/^\/points/, async (msg) => {
      try {
        const sender = msg.from;
        const senderId = sender.id;

        const pool = require('./config/database');

        // Get user's points
        const userResult = await pool.query(
          'SELECT points FROM telegram_users WHERE id = $1',
          [parseInt(senderId, 10)]
        );

        let pointsMessage = '';

        if (userResult.rows.length > 0) {
          const points = userResult.rows[0].points || 0;
          pointsMessage = `💰 You currently have ${points} points.`;

          if (points === 0) {
            pointsMessage += '\n\nComplete tasks in the Mini App to earn more!';
          } else if (points < 50) {
            pointsMessage += '\n\nKeep going! Refer friends to earn more points quickly.';
          } else if (points >= 50 && points < 200) {
            pointsMessage += "\n\nYou're doing great! Keep completing tasks to earn rewards.";
          } else {
            pointsMessage += "\n\nImpressive! You're one of our top users.";
          }
        } else {
          pointsMessage = 'You are not registered yet. Please use /start to register.';
        }

        await this.bot.sendMessage(msg.chat.id, pointsMessage);
      } catch (error) {
        logger.error('Error handling points command:', error);
        await this.bot.sendMessage(
          msg.chat.id,
          'Sorry, there was an error checking your points. Please try again later.'
        );
      }
    });

    // Handle /referral command
    this.bot.onText(/^\/referral/, async (msg) => {
      try {
        const sender = msg.from;
        const senderId = sender.id;
        const referralInfo = await this.getUserReferralLink(senderId);

        if (referralInfo.success) {
          let referralMessage = '';

          if (referralInfo.referralLink) {
            referralMessage = `🔗 Your Referral Link:
${referralInfo.referralLink}

Your Referral Code: ${referralInfo.referralCode}

Share this link with friends and earn 30 points for each new user who joins!`;
          } else {
            referralMessage = `🔗 Your Referral Code: ${referralInfo.referralCode}

We could not detect the bot username automatically, so a direct link is not available.
Share this code with your friends and ask them to send /start ref${referralInfo.referralCode} to the bot.`;
          }

          await this.bot.sendMessage(msg.chat.id, referralMessage);
        } else {
          await this.bot.sendMessage(
            msg.chat.id,
            `⚠️ ${
              referralInfo.message || 'Unable to generate referral link at this time.'
            } Please try again later.`
          );
        }
      } catch (error) {
        logger.error('Error handling referral command:', error);
        await this.bot.sendMessage(
          msg.chat.id,
          '⚠️ Error generating your referral link. Please try again later.'
        );
      }
    });

    // Handle /menu command to show interactive help-style menu
    this.bot.onText(/^\/menu/, async (msg) => {
      try {
        const chatId = msg.chat.id;

        await this.bot.sendMessage(chatId, 'Please choose your language:', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'العربية', callback_data: 'lang:ar' },
                { text: 'English', callback_data: 'lang:en' },
                { text: 'Русский', callback_data: 'lang:ru' },
                { text: 'Française', callback_data: 'lang:fr' }
              ]
            ]
          }
        });
      } catch (error) {
        logger.error('Error handling /menu command:', error);
      }
    });

    // Handle inline keyboard steps (language -> country -> topic)
    this.bot.on('callback_query', async (query) => {
      try {
        const data = query.data || '';
        const chatId = query.message.chat.id;

        // Step 1: language selected -> ask for country (keep previous row)
        if (data.startsWith('lang:')) {
          const lang = data.split(':')[1];

          await this.bot.sendMessage(chatId, 'Please select a country:', {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Qatar 🇶🇦', callback_data: `country:${lang}:qa` },
                  { text: 'UK 🇬🇧', callback_data: `country:${lang}:uk` }
                ],
                [
                  { text: 'Kuwait 🇰🇼', callback_data: `country:${lang}:kw` },
                  { text: 'Other', callback_data: `country:${lang}:other` }
                ]
              ]
            }
          });
        }

        // Step 2: country selected -> ask for help topic (keep previous rows)
        else if (data.startsWith('country:')) {
          const parts = data.split(':');
          const lang = parts[1];
          const country = parts[2];

          await this.bot.sendMessage(chatId, 'How can we help you?', {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: 'Job requests', callback_data: `topic:${lang}:${country}:job` },
                  { text: 'Support', callback_data: `topic:${lang}:${country}:support` }
                ],
                [
                  { text: 'Business', callback_data: `topic:${lang}:${country}:business` }
                ]
              ]
            }
          });
        }

        // Step 3: topic selected -> send canned answer
        else if (data.startsWith('topic:')) {
          const parts = data.split(':');
          const lang = parts[1];
          const country = parts[2];
          const topic = parts[3];

          let response = '';

          if (lang === 'ar') {
            if (topic === 'job') {
              response = 'سيتم مراجعة طلب التوظيف الخاص بك من قبل فريقنا. شكراً لاهتمامك.';
            } else if (topic === 'support') {
              response = 'سيتم إيصالك مع موظف خدمة الدعم الفني في أقرب وقت.';
            } else {
              response = 'شكرًا لتواصلك معنا. سيتم مراجعة طلبك والرد عليك قريبًا.';
            }
          } else {
            // Default English-style messages
            if (topic === 'job') {
              response = 'Your job request has been received. Our team will review it as soon as possible.';
            } else if (topic === 'support') {
              response = 'You will be connected to a support agent shortly. Thank you for your patience.';
            } else {
              response = 'Thank you for contacting us. We will review your inquiry and respond as soon as we can.';
            }

            if (country === 'uk') {
              response += '\n\nNote: Our services may be limited or unavailable in the UK.';
            }
          }

          await this.bot.sendMessage(chatId, 'Thank you. Here is an automated reply:');

          await this.bot.sendMessage(chatId, response);
        }

        // Always answer callback to remove loading state in Telegram UI
        await this.bot.answerCallbackQuery(query.id).catch(() => {});
      } catch (error) {
        logger.error('Error handling callback_query:', error);
      }
    });
  }

  async stop() {
    if (this.bot) {
      await this.bot.stopPolling();
      console.log('Bot stopped');
    }
  }
}

// Create bot instance for the main thread
let botInstance = null;

const createBot = async () => {
  if (!botInstance) {
    botInstance = new TelegramBot(process.env.BOT_TOKEN);
    await botInstance.start();
  }
  return botInstance;
};

module.exports.createBot = createBot; // Also export createBot for new usage
module.exports.TelegramBot = TelegramBot; // Export TelegramBot class
