const TelegramBotApi = require('node-telegram-bot-api');
const path = require('path');
const { logger } = require('./config/logger');
const pool = require('./config/database'); // shared DB pool (used by /start welcome_message lookup, etc.)
const { DbFlowEngine } = require('./flow/db-flow-engine');

class TelegramBot {
  constructor(botToken) {
    this.botToken = botToken;

    // Human-like send helpers (typing/upload action + small delay)
    this.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    this.calcHumanDelay = (text) => {
      const len = typeof text === 'string' ? text.length : 0;
      return Math.max(400, Math.min(2200, 350 + len * 18));
    };

    this.humanSendText = async (chatId, text, opts) => {
      try { await this.bot.sendChatAction(chatId, 'typing'); } catch {}
      await this.sleep(this.calcHumanDelay(text));
      return this.bot.sendMessage(chatId, text, opts);
    };

    this.humanSendPhoto = async (chatId, fileIdOrUrl, opts) => {
      try { await this.bot.sendChatAction(chatId, 'upload_photo'); } catch {}
      await this.sleep(850);
      return this.bot.sendPhoto(chatId, fileIdOrUrl, opts);
    };

    this.humanSendVideo = async (chatId, fileIdOrUrl, opts) => {
      try { await this.bot.sendChatAction(chatId, 'upload_video'); } catch {}
      await this.sleep(950);
      return this.bot.sendVideo(chatId, fileIdOrUrl, opts);
    };

    this.humanSendDocument = async (chatId, fileIdOrUrl, opts) => {
      try { await this.bot.sendChatAction(chatId, 'upload_document'); } catch {}
      await this.sleep(900);
      return this.bot.sendDocument(chatId, fileIdOrUrl, opts);
    };
    this.bot = null;
    this.isReady = false;
    this.botUsername = null; // cached from getMe()

    // In-memory conversation states (onboarding, etc.)
    // Map<chatId, { mode: 'onboarding', questionIndex: number, questions: any[] }>
    this.chatStates = new Map();

    // Persisted decision-tree flows
    this.flow = null;
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

      // Initialize DB-backed flow engine (uses Postgres for persistence + published flow definitions)
      this.flow = new DbFlowEngine({ pool, bot: this.bot, logger });

      logger.info('Bot started successfully (Bot API polling mode)');

      // Setup channel membership verification scheduler
      this.setupChannelVerificationScheduler();

      // Wrap send methods so every outbound message is logged to DB.
      this.wrapOutboundSendMethods();

      // Register message handlers
      this.registerHandlers();

      // Start group/channel management (welcome, delete links, mute) and scheduled posts
      this.startGroupChannelManagement();
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

  // Group/Channel management (welcome new members, delete any link, auto-mute) + scheduled posts
  startGroupChannelManagement() {
    const pool = require('./config/database');

    // Welcome + delete links
    this.bot.on('message', async (msg) => {
      try {
        if (!msg?.chat?.id) return;
        const chatId = msg.chat.id;
        const chatType = msg.chat.type;

        if (!['group', 'supergroup', 'channel'].includes(chatType)) return;

        // Register chat so admin can see chat_id in the dashboard
        try {
          await pool.query(
            `INSERT INTO bot_chats (chat_id, chat_type, title, username, last_seen_at, updated_at)
             VALUES ($1,$2,$3,$4,NOW(),NOW())
             ON CONFLICT (chat_id) DO UPDATE SET
               chat_type=EXCLUDED.chat_type,
               title=EXCLUDED.title,
               username=EXCLUDED.username,
               last_seen_at=NOW(),
               updated_at=NOW()`,
            [chatId, chatType, msg.chat.title || null, msg.chat.username || null]
          );
        } catch {}

        // Load GLOBAL moderation settings (applies to all groups/channels)
        let settings;
        try {
          const keys = [
            'moderation_enabled',
            'moderation_welcome_enabled',
            'moderation_welcome_text',
            'moderation_delete_links_enabled',
            'moderation_auto_mute_enabled',
            'moderation_auto_mute_seconds'
          ];
          const s = await pool.query(
            `SELECT key, value FROM settings WHERE key = ANY($1::text[])`,
            [keys]
          );
          const map = new Map(s.rows.map((r) => [r.key, String(r.value)]));
          settings = {
            enabled: map.get('moderation_enabled') !== 'false',
            welcome_enabled: map.get('moderation_welcome_enabled') === 'true',
            welcome_text: map.get('moderation_welcome_text') || '',
            delete_links_enabled: map.get('moderation_delete_links_enabled') === 'true',
            auto_mute_enabled: map.get('moderation_auto_mute_enabled') === 'true',
            auto_mute_seconds: Number(map.get('moderation_auto_mute_seconds') || 3600),
          };
        } catch {
          return;
        }

        if (!settings || settings.enabled === false) return;

        // Welcome new members (send in group)
        if (settings.welcome_enabled && Array.isArray(msg.new_chat_members) && msg.new_chat_members.length > 0) {
          const text = String(settings.welcome_text || '').trim();
          if (text) {
            await this.bot.sendMessage(chatId, text, { parse_mode: 'HTML' });
          }
        }

        // Delete any link
        if (settings.delete_links_enabled) {
          const hasLinkEntity = Array.isArray(msg.entities)
            ? msg.entities.some((e) => e.type === 'url' || e.type === 'text_link')
            : false;
          const textHasHttp = typeof msg.text === 'string' && /https?:\/\//i.test(msg.text);
          const captionHasHttp = typeof msg.caption === 'string' && /https?:\/\//i.test(msg.caption);
          const containsLink = hasLinkEntity || textHasHttp || captionHasHttp;

          if (containsLink && msg.message_id && msg.from) {
            try {
              await this.bot.deleteMessage(chatId, msg.message_id);
            } catch {}

            if (settings.auto_mute_enabled) {
              const seconds = Number(settings.auto_mute_seconds) || 3600;
              try {
                const untilDate = Math.floor(Date.now() / 1000) + seconds;
                await this.bot.restrictChatMember(chatId, msg.from.id, {
                  permissions: {
                    can_send_messages: false,
                    can_send_media_messages: false,
                    can_send_polls: false,
                    can_send_other_messages: false,
                    can_add_web_page_previews: false,
                    can_change_info: false,
                    can_invite_users: false,
                    can_pin_messages: false
                  },
                  until_date: untilDate
                });
              } catch {}
            }
          }
        }
      } catch {}
    });

    // Scheduler: send due scheduled posts
    setInterval(async () => {
      try {
        const due = await pool.query(
          `SELECT * FROM scheduled_posts
           WHERE status='pending' AND send_at <= NOW()
           ORDER BY send_at ASC
           LIMIT 20`
        );

        for (const job of due.rows) {
          try {
            if (job.content_type === 'photo' && job.media_url) {
              await this.bot.sendPhoto(job.chat_id, job.media_url, job.text ? { caption: job.text, parse_mode: 'HTML' } : undefined);
            } else if (job.content_type === 'video' && job.media_url) {
              await this.bot.sendVideo(job.chat_id, job.media_url, job.text ? { caption: job.text, parse_mode: 'HTML' } : undefined);
            } else {
              await this.bot.sendMessage(job.chat_id, String(job.text || ''), { parse_mode: 'HTML' });
            }

            await pool.query('UPDATE scheduled_posts SET status=\'sent\', updated_at=NOW() WHERE id=$1', [job.id]);
          } catch (e) {
            await pool.query('UPDATE scheduled_posts SET status=\'failed\', error=$2, updated_at=NOW() WHERE id=$1', [job.id, String(e?.message || e)]);
          }
        }
      } catch {}
    }, 5000);
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

  async logUserRequest({ sender, chatId, source, actionKey, message, payload = {} }) {
    try {
      // Ensure user exists
      const reg = await this.registerUser(sender);
      if (!reg.success) return;

      await pool.query(
        `INSERT INTO user_requests (user_id, telegram_chat_id, source, action_key, message, payload, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'open')`,
        [reg.user.id, chatId, source, actionKey, message, JSON.stringify(payload)]
      );
    } catch (e) {
      logger.error('Failed to log user request:', e);
    }
  }

  // --- Conversation Inbox (all messages) ---
  async ensureConversation({ chatId, sender }) {
    // Make sure the user exists first (so we can link conversation.user_id)
    let userId = null;
    try {
      if (sender) {
        const reg = await this.registerUser(sender);
        if (reg && reg.success && reg.user && reg.user.id) userId = reg.user.id;
      }
    } catch (e) {
      // Ignore registration errors for logging purposes
    }

    const result = await pool.query(
      `INSERT INTO conversations (telegram_chat_id, user_id, status, created_at, updated_at)
       VALUES ($1, $2, 'open', NOW(), NOW())
       ON CONFLICT (telegram_chat_id)
       DO UPDATE SET user_id = COALESCE(conversations.user_id, EXCLUDED.user_id), updated_at = NOW()
       RETURNING *`,
      [chatId, userId]
    );

    return result.rows[0];
  }

  extractMessageInfo(msg) {
    // Returns normalized message info for DB
    const base = {
      telegram_message_id: msg && msg.message_id ? msg.message_id : null,
      telegram_reply_to_message_id: msg && msg.reply_to_message && msg.reply_to_message.message_id ? msg.reply_to_message.message_id : null,
      sender_telegram_user_id: msg && msg.from && msg.from.id ? msg.from.id : null,
      type: 'unknown',
      text: null,
      file_id: null,
      file_unique_id: null,
      file_name: null,
      mime_type: null,
      file_size: null,
      media_duration: null,
      payload: {}
    };

    if (!msg) return base;

    // Text
    if (typeof msg.text === 'string' && msg.text.length > 0) {
      base.type = 'text';
      base.text = msg.text;
      return base;
    }

    // Photo (array of sizes)
    if (Array.isArray(msg.photo) && msg.photo.length > 0) {
      const best = msg.photo[msg.photo.length - 1];
      base.type = 'photo';
      base.text = msg.caption || null;
      base.file_id = best.file_id || null;
      base.file_unique_id = best.file_unique_id || null;
      base.file_size = best.file_size || null;
      return base;
    }

    // Video
    if (msg.video) {
      base.type = 'video';
      base.text = msg.caption || null;
      base.file_id = msg.video.file_id || null;
      base.file_unique_id = msg.video.file_unique_id || null;
      base.file_size = msg.video.file_size || null;
      base.mime_type = msg.video.mime_type || null;
      base.media_duration = msg.video.duration || null;
      return base;
    }

    // Audio
    if (msg.audio) {
      base.type = 'audio';
      base.text = msg.caption || null;
      base.file_id = msg.audio.file_id || null;
      base.file_unique_id = msg.audio.file_unique_id || null;
      base.file_size = msg.audio.file_size || null;
      base.mime_type = msg.audio.mime_type || null;
      base.file_name = msg.audio.file_name || null;
      base.media_duration = msg.audio.duration || null;
      return base;
    }

    // Voice
    if (msg.voice) {
      base.type = 'voice';
      base.text = msg.caption || null;
      base.file_id = msg.voice.file_id || null;
      base.file_unique_id = msg.voice.file_unique_id || null;
      base.file_size = msg.voice.file_size || null;
      base.mime_type = msg.voice.mime_type || null;
      base.media_duration = msg.voice.duration || null;
      return base;
    }

    // Document
    if (msg.document) {
      base.type = 'document';
      base.text = msg.caption || null;
      base.file_id = msg.document.file_id || null;
      base.file_unique_id = msg.document.file_unique_id || null;
      base.file_size = msg.document.file_size || null;
      base.mime_type = msg.document.mime_type || null;
      base.file_name = msg.document.file_name || null;
      return base;
    }

    // Sticker
    if (msg.sticker) {
      base.type = 'sticker';
      base.file_id = msg.sticker.file_id || null;
      base.file_unique_id = msg.sticker.file_unique_id || null;
      base.file_size = msg.sticker.file_size || null;
      base.mime_type = msg.sticker.mime_type || null;
      return base;
    }

    // Fallback: store some metadata
    base.payload = {
      has_caption: !!msg.caption,
      date: msg.date,
      entities: msg.entities || null
    };

    return base;
  }

  async logConversationMessage({ chatId, sender, direction, msg }) {
    try {
      if (!chatId) return;

      const conversation = await this.ensureConversation({ chatId, sender });
      if (!conversation || !conversation.id) return;

      const info = this.extractMessageInfo(msg);

      // Insert message row
      await pool.query(
        `INSERT INTO conversation_messages (
          conversation_id,
          direction,
          telegram_message_id,
          telegram_reply_to_message_id,
          sender_telegram_user_id,
          type,
          text,
          file_id,
          file_unique_id,
          file_name,
          mime_type,
          file_size,
          media_duration,
          payload,
          created_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW()
        )`,
        [
          conversation.id,
          direction,
          info.telegram_message_id,
          info.telegram_reply_to_message_id,
          info.sender_telegram_user_id,
          info.type,
          info.text,
          info.file_id,
          info.file_unique_id,
          info.file_name,
          info.mime_type,
          info.file_size,
          info.media_duration,
          JSON.stringify(info.payload || {})
        ]
      );

      // Update conversation summary
      const preview = (info.text && String(info.text).trim())
        ? String(info.text).trim().slice(0, 280)
        : (info.type ? `[${info.type}]` : '[message]');

      await pool.query(
        `UPDATE conversations
         SET last_message_at = NOW(),
             last_message_preview = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [conversation.id, preview]
      );
    } catch (e) {
      // Logging must never crash bot
      logger.error('Failed to log conversation message:', e);
    }
  }

  wrapOutboundSendMethods() {
    if (!this.bot || this.bot.__inboxWrapped) return;
    this.bot.__inboxWrapped = true;

    const wrap = (methodName, typeHint) => {
      const original = this.bot[methodName];
      if (typeof original !== 'function') return;

      this.bot[methodName] = async (...args) => {
        const chatId = args && args.length > 0 ? args[0] : null;
        try {
          const sent = await original.apply(this.bot, args);
          // Log outbound using the returned Telegram message object
          await this.logConversationMessage({
            chatId,
            sender: null,
            direction: 'outbound',
            msg: sent
          });
          return sent;
        } catch (err) {
          throw err;
        }
      };
    };

    wrap('sendMessage', 'text');
    wrap('sendPhoto', 'photo');
    wrap('sendVideo', 'video');
    wrap('sendAudio', 'audio');
    wrap('sendVoice', 'voice');
    wrap('sendDocument', 'document');
  }

  async getSettingValue(key) {
    const res = await pool.query('SELECT value FROM settings WHERE key = $1 LIMIT 1', [key]);
    return res.rows?.[0]?.value ?? null;
  }

  async getSettingJson(key, fallback) {
    try {
      const raw = await this.getSettingValue(key);
      if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
      return JSON.parse(String(raw));
    } catch (e) {
      return fallback;
    }
  }

  async getDefaultLanguage() {
    const def = await this.getSettingValue('default_language');
    return (def && String(def).trim()) ? String(def).trim() : 'en';
  }

  async getUserLanguage(userId, senderFallbackLang) {
    try {
      const res = await pool.query('SELECT language_code FROM telegram_users WHERE id = $1 LIMIT 1', [parseInt(userId, 10)]);
      const dbLang = res.rows?.[0]?.language_code;
      if (dbLang) return String(dbLang);
    } catch (e) {
      // ignore
    }

    if (senderFallbackLang) return String(senderFallbackLang);
    return await this.getDefaultLanguage();
  }

  async getOnboardingQuestions() {
    const res = await pool.query(
      `SELECT * FROM onboarding_questions WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`
    );
    return res.rows || [];
  }

  getTranslation(obj, lang, fallback = '') {
    if (!obj) return fallback;
    if (typeof obj === 'string') return obj;
    if (obj[lang]) return obj[lang];
    if (obj.en) return obj.en;
    const first = Object.values(obj)[0];
    return typeof first === 'string' ? first : fallback;
  }

  async startOnboarding(chatId, sender, userLang) {
    const questions = await this.getOnboardingQuestions();
    if (!questions.length) {
      await pool.query('UPDATE telegram_users SET onboarding_completed = TRUE WHERE id = $1', [parseInt(sender.id, 10)]).catch(() => {});
      return;
    }

    this.chatStates.set(chatId, { mode: 'onboarding', questionIndex: 0, questions, lang: userLang, userId: parseInt(sender.id, 10) });
    await this.askNextOnboardingQuestion(chatId);
  }

  async askNextOnboardingQuestion(chatId) {
    const st = this.chatStates.get(chatId);
    if (!st || st.mode !== 'onboarding') return;

    const { questionIndex, questions, lang } = st;

    if (questionIndex >= questions.length) {
      // Done
      this.chatStates.delete(chatId);
      await pool.query('UPDATE telegram_users SET onboarding_completed = TRUE WHERE id = $1', [st.userId]).catch(() => {});
      await this.bot.sendMessage(chatId, '✅ Thank you!');
      return;
    }

    const q = questions[questionIndex];
    const questionText = this.getTranslation(q.question_translations, lang, '');

    if (q.type === 'single_choice' && q.options_translations) {
      const optionsByLang = q.options_translations?.[lang] || q.options_translations?.en || {};
      // Put onboarding options in ONE ROW
      const inline_keyboard = [
        Object.entries(optionsByLang).map(([key, label]) => ({
          text: String(label),
          callback_data: `onb:${q.id}:${key}`
        }))
      ];

      await this.bot.sendMessage(chatId, questionText || 'Please choose:', {
        reply_markup: { inline_keyboard }
      });
      return;
    }

    // default: text
    await this.bot.sendMessage(chatId, questionText || 'Please type your answer:');
  }

  async saveOnboardingAnswer(userId, questionId, payload) {
    const { answer_text, answer_option_key } = payload;
    await pool.query(
      `INSERT INTO onboarding_answers (user_id, question_id, answer_text, answer_option_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, question_id)
       DO UPDATE SET answer_text = EXCLUDED.answer_text, answer_option_key = EXCLUDED.answer_option_key, created_at = NOW()`,
      [userId, questionId, answer_text || null, answer_option_key || null]
    );
  }

  registerHandlers() {
    if (!this.bot) return;

    // Log ALL inbound messages (text + media + commands) to the conversation inbox.
    // This runs in addition to other handlers (onboarding, commands, etc.).
    this.bot.on('message', async (msg) => {
      try {
        if (!msg || !msg.chat) return;
        // Ignore messages from bots (optional)
        if (msg.from && msg.from.is_bot) return;

        await this.logConversationMessage({
          chatId: msg.chat.id,
          sender: msg.from,
          direction: 'inbound',
          msg
        });
      } catch (e) {
        // keep silent
      }
    });

    // Handle /start command with error recovery
    this.bot.onText(/^\/start(?:\s+(.*))?/, async (msg, match) => {
      try {
        const sender = msg.from;

        // Register user in database
        const registrationResult = await this.registerUser(sender);

        // Determine user's language (DB language_code > Telegram language_code > default_language)
        // NOTE: language is still useful for onboarding question translations.
        const userLang = await this.getUserLanguage(sender.id, sender.language_code);

        // Welcome blocks (preferred): ordered /start sequence stored in DB
        let welcomeBlocks = [];
        try {
          const wbRes = await pool.query(
            `SELECT * FROM welcome_blocks WHERE is_active = TRUE ORDER BY sort_order ASC, id ASC`
          );
          welcomeBlocks = wbRes.rows || [];
        } catch (e) {
          // If table doesn't exist yet, ignore and fall back to legacy settings.
          welcomeBlocks = [];
        }

        // NOTE: Legacy welcome settings are intentionally ignored.
        // /start should respond ONLY from welcome_blocks configured in Admin Panel.

        // Collect variables for template replacement
        const points = registrationResult.success ? (registrationResult.user.points || 0) : 0;

        // Check for referral code in /start params (we do this before rendering so variables are available)
        let referrerName = '';
        let referrerPoints = '';

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
            referrerName =
              referralResult.referrer.first_name ||
              referralResult.referrer.username ||
              'Someone';
            referrerPoints = String(referralResult.points ?? '');
          }
        }

        const welcomeMessage = '';

        let startedWelcomeFlow = false;
        let pendingWelcomeFlowSlug = null;

        // If welcome blocks exist, send them in order (only for /start)
        if (Array.isArray(welcomeBlocks) && welcomeBlocks.length > 0) {
          for (const b of welcomeBlocks) {
            if (!b || b.is_active === false) continue;
            const type = String(b.block_type || '').trim();
            const payload = b.payload || {};

            try {
              if (type === 'text') {
                const t = String(payload.text || '').trim();
                if (t) await this.humanSendText(msg.chat.id, t, { parse_mode: 'HTML' });
              } else if (type === 'link') {
                const title = String(payload.title || '').trim() || 'Link';
                const url = String(payload.url || '').trim();
                if (url) {
                  const html = `<a href="${url}">${title}</a>`;
                  await this.humanSendText(msg.chat.id, html, { parse_mode: 'HTML', disable_web_page_preview: false });
                }
              } else if (type === 'image') {
                const url = String(payload.url || '').trim();
                const caption = String(payload.caption || '').trim();
                if (url) {
                  await this.humanSendPhoto(msg.chat.id, url, caption ? { caption, parse_mode: 'HTML' } : undefined);
                }
              } else if (type === 'video') {
                const url = String(payload.url || '').trim();
                const caption = String(payload.caption || '').trim();
                if (url) {
                  await this.humanSendVideo(msg.chat.id, url, caption ? { caption, parse_mode: 'HTML' } : undefined);
                }
              } else if (type === 'question_flow') {
                // Delay flow start until after other welcome blocks are sent.
                const slug = String(payload.slug || '').trim();
                if (slug && this.flow) {
                  pendingWelcomeFlowSlug = slug;
                }
              }
            } catch (e) {
              // Some logger configurations hide meta/error. Print a plain error for debugging.
              console.error(
                `[welcome_blocks] failed type=${type} chatId=${msg?.chat?.id} userId=${sender?.id} payload=${JSON.stringify(payload)}`
              );
              console.error(e);

              logger.warn(
                'Could not send welcome block',
                {
                  type,
                  payload,
                  chatId: msg?.chat?.id,
                  userId: sender?.id,
                },
                e
              );
            }
          }

          // Start flow after sending all other welcome blocks
          if (pendingWelcomeFlowSlug && this.flow) {
            try {
              await this.flow.startFlow({
                chatId: msg.chat.id,
                userId: sender.id,
                slug: pendingWelcomeFlowSlug,
                lang: userLang,
              });
              startedWelcomeFlow = true;
            } catch (e) {
              console.error(`[welcome_blocks] failed to start flow slug=${pendingWelcomeFlowSlug}`);
              console.error(e);
            }
          }
        } else {
          // No welcome blocks configured (or table missing). Do nothing.
          // This ensures deleted/empty table does not fall back to old welcome settings.
        }

        // NOTE: onboarding is disabled. Bot should respond only to /start welcome blocks.
        // (No automatic onboarding or other command responses.)
      } catch (error) {
        logger.error('Error handling start command:', error);
        // Fallback to plain message without buttons if markup fails
        try {
          const sender = msg.from;
          const fallbackMessage = `👋 Welcome to Dashbot, ${sender.first_name || ''}!`;

          await this.humanSendText(msg.chat.id, fallbackMessage);
        } catch (fallbackError) {
          logger.error('Fallback message also failed:', fallbackError);
        }
      }
    });

    // Capture onboarding answers (text) and flow text answers
    this.bot.on('message', async (msg) => {
      try {
        const chatId = msg.chat.id;

        // If a flow session exists, route input depending on node type.
        if (this.flow) {
          const session = await this.flow.getSession(chatId);
          if (session) {
            const sender = msg.from;
            const userLang = await this.getUserLanguage(sender.id, sender.language_code);

            // file nodes: accept photo/video/document
            if (msg.photo && Array.isArray(msg.photo) && msg.photo.length) {
              const p = msg.photo[msg.photo.length - 1];
              await this.flow.transition({ chatId, lang: userLang || 'en', media: { type: 'photo', file_id: p.file_id, file_unique_id: p.file_unique_id } });
              return;
            }
            if (msg.video) {
              await this.flow.transition({ chatId, lang: userLang || 'en', media: { type: 'video', file_id: msg.video.file_id, file_unique_id: msg.video.file_unique_id } });
              return;
            }
            if (msg.document) {
              await this.flow.transition({ chatId, lang: userLang || 'en', media: { type: 'document', file_id: msg.document.file_id, file_unique_id: msg.document.file_unique_id } });
              return;
            }

            // text nodes
            if (msg.text && !String(msg.text).startsWith('/')) {
              await this.flow.transition({ chatId, lang: userLang || 'en', answer: String(msg.text) });
              return;
            }

            // ignore commands while in flow
            return;
          }
        }

        // Outside a flow, ignore ALL messages (no replies). Only /start should respond.
        return;
      } catch (e) {
        // keep silent
      }
    });

    // Disabled: bot should respond only to /start
    this.bot.onText(/^\/flow(?:\s+(.*))?/, async (msg, match) => {
      return;
      try {
        const chatId = msg.chat.id;
        const sender = msg.from;
        const userLang = await this.getUserLanguage(sender.id, sender.language_code);

        // Choose which flow to run. Default: service_flow (DB slug)
        // DB-only default flow selection (no .env DEFAULT_FLOW_ID)
        let slug = String((await this.getSettingValue('default_flow_id')) || '').trim();
        if (!slug) {
          // Auto-pick newest published active flow if no default is configured
          const r = await pool.query(
            `SELECT f.slug
             FROM flows f
             JOIN flow_versions v ON v.flow_id = f.id AND v.status='published'
             WHERE f.is_active=TRUE
             ORDER BY v.updated_at DESC
             LIMIT 1`
          );
          slug = String(r.rows[0]?.slug || '').trim();
        }
        if (!slug) {
          await this.bot.sendMessage(chatId, '⚠️ No published flow is configured. Please publish a flow and set it as default in Admin Panel → Flows.');
          return;
        }
        await this.flow.startFlow({ chatId, userId: parseInt(sender.id, 10), slug, lang: userLang || 'en' });
      } catch (e) {
        logger.error('Error starting flow:', e);

        // Friendly diagnostics (common admin misconfiguration)
        try {
          const configured = String((await this.getSettingValue('default_flow_id')) || '').trim();
          let slug = configured;
          if (!slug) {
            const r = await pool.query(
              `SELECT f.slug
               FROM flows f
               JOIN flow_versions v ON v.flow_id = f.id AND v.status='published'
               WHERE f.is_active=TRUE
               ORDER BY v.updated_at DESC
               LIMIT 1`
            );
            slug = String(r.rows[0]?.slug || '').trim();
          }

          if (slug) {
            const flowRes = await pool.query('SELECT id FROM flows WHERE slug=$1 AND is_active=TRUE LIMIT 1', [slug]);
            if (flowRes.rows.length) {
              const verRes = await pool.query(
                `SELECT start_node_key FROM flow_versions WHERE flow_id=$1 AND status='published' LIMIT 1`,
                [flowRes.rows[0].id]
              );
              if (!verRes.rows.length) {
                await this.bot.sendMessage(msg.chat.id, '⚠️ No published version found for the default flow. Publish a version in Admin Panel → Flows.');
                return;
              }
              if (!verRes.rows[0].start_node_key) {
                await this.bot.sendMessage(msg.chat.id, '⚠️ First Question not set. Please set “First Question ID (start)” and publish the version in Admin Panel → Flows.');
                return;
              }
            }
          }
        } catch {
          // ignore secondary diagnostics errors
        }

        // As a last resort, show a safe error reason (no secrets/stack) to help debugging in production.
        const rawMsg = String(e?.message || '');
        const code = String(e?.code || '');
        let reason = null;

        // Telegram polling conflict
        if (rawMsg.includes('ETELEGRAM: 409') || rawMsg.includes('409 Conflict')) {
          reason = 'Another bot instance is running (Telegram 409 Conflict). Stop other instances and redeploy.';
        }
        // Missing DB tables/columns (migrations)
        else if (rawMsg.includes('does not exist')) {
          if (rawMsg.includes('flow_sessions')) reason = 'Database migration missing: flow_sessions table not found.';
          else if (rawMsg.includes('flows')) reason = 'Database migration missing: flows table not found.';
          else if (rawMsg.includes('flow_versions')) reason = 'Database migration missing: flow_versions table not found.';
          else if (rawMsg.includes('flow_nodes')) reason = 'Database migration missing: flow_nodes table not found.';
          else if (rawMsg.includes('flow_options')) reason = 'Database migration missing: flow_options table not found.';
          else if (rawMsg.includes('flow_version_id')) reason = 'Database migration missing: flow_sessions.flow_version_id column not found.';
          else reason = 'Database migration missing: required table/column not found.';
        }
        // Invalid integer input (often undefined IDs)
        else if (code === '22P02' || rawMsg.includes('invalid input syntax for type integer')) {
          reason = 'Invalid ID was sent to the server (often happens if Options are saved before saving the Question). Save the Question first.';
        }

        const safeDetails = reason ? `\nReason: ${reason}` : '';
        await this.bot.sendMessage(msg.chat.id, `⚠️ Could not start the flow.${safeDetails}`);
      }
    });

    // Cancel current flow
    this.bot.onText(/^\/flowcancel$/, async (msg) => {
      return;
      try {
        if (this.flow) await this.flow.stopFlow(msg.chat.id);
        await this.bot.sendMessage(msg.chat.id, '✅ Flow cancelled.');
      } catch (e) {}
    });

    // Restart flow
    this.bot.onText(/^\/flowrestart$/, async (msg) => {
      return;
      try {
        const sender = msg.from;
        const userLang = await this.getUserLanguage(sender.id, sender.language_code);
        // DB-only default flow selection (no .env DEFAULT_FLOW_ID)
        let slug = String((await this.getSettingValue('default_flow_id')) || '').trim();
        if (!slug) {
          const r = await pool.query(
            `SELECT f.slug
             FROM flows f
             JOIN flow_versions v ON v.flow_id = f.id AND v.status='published'
             WHERE f.is_active=TRUE
             ORDER BY v.updated_at DESC
             LIMIT 1`
          );
          slug = String(r.rows[0]?.slug || '').trim();
        }
        if (!slug) {
          await this.bot.sendMessage(msg.chat.id, '⚠️ No published flow is configured. Please publish a flow and set it as default in Admin Panel → Flows.');
          return;
        }
        await this.flow.startFlow({ chatId: msg.chat.id, userId: parseInt(sender.id, 10), slug, lang: userLang || 'en' });
      } catch (e) {
        logger.error('Error restarting flow:', e);

        try {
          const configured = String((await this.getSettingValue('default_flow_id')) || '').trim();
          let slug = configured;
          if (!slug) {
            const r = await pool.query(
              `SELECT f.slug
               FROM flows f
               JOIN flow_versions v ON v.flow_id = f.id AND v.status='published'
               WHERE f.is_active=TRUE
               ORDER BY v.updated_at DESC
               LIMIT 1`
            );
            slug = String(r.rows[0]?.slug || '').trim();
          }

          if (slug) {
            const flowRes = await pool.query('SELECT id FROM flows WHERE slug=$1 AND is_active=TRUE LIMIT 1', [slug]);
            if (flowRes.rows.length) {
              const verRes = await pool.query(
                `SELECT start_node_key FROM flow_versions WHERE flow_id=$1 AND status='published' LIMIT 1`,
                [flowRes.rows[0].id]
              );
              if (!verRes.rows.length) {
                await this.bot.sendMessage(msg.chat.id, '⚠️ No published version found for the default flow. Publish a version in Admin Panel → Flows.');
                return;
              }
              if (!verRes.rows[0].start_node_key) {
                await this.bot.sendMessage(msg.chat.id, '⚠️ First Question not set. Please set “First Question ID (start)” and publish the version in Admin Panel → Flows.');
                return;
              }
            }
          }
        } catch {}

        await this.bot.sendMessage(msg.chat.id, '⚠️ Could not restart flow.');
      }
    });

    // Disabled: bot should respond only to /start
    this.bot.onText(/^\/support(?:\s+(.*))?/, async (msg, match) => {
      return;
      try {
        const sender = msg.from;
        const chatId = msg.chat.id;
        const text = match && match[1] ? match[1].trim() : '';

        await this.logUserRequest({
          sender,
          chatId,
          source: 'command',
          actionKey: '/support',
          message: text || 'User requested support',
          payload: { text }
        });

        await this.bot.sendMessage(chatId, '✅ Your support request has been sent to our admin team. We will reply here soon.');
      } catch (error) {
        logger.error('Error handling /support command:', error);
      }
    });

    // Disabled: bot should respond only to /start
    this.bot.onText(/^\/help/, async (msg) => {
      return;
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

    // Disabled: bot should respond only to /start
    this.bot.onText(/^\/points/, async (msg) => {
      return;
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

    // Disabled: bot should respond only to /start
    this.bot.onText(/^\/referral/, async (msg) => {
      return;
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

    // Disabled: bot should respond only to /start
    this.bot.onText(/^\/menu/, async (msg) => {
      return;
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

        // Flow engine (single_choice)
        if (data.startsWith('flowmulti:')) {
          const parts = data.split(':');
          const slug = parts[1];
          const nodeKey = parts[2];
          const optionKey = parts[3];
          const userLang = await this.getUserLanguage(query.from.id, query.from.language_code);

          try {
            const label = await this.flow.getChoiceLabel({ slug, nodeKey, optionKey, lang: userLang || 'en' });
            const nodeText = await this.flow.getChoiceNodeText({ slug, nodeKey, lang: userLang || 'en' });
            await this.logUserRequest({
              sender: query.from,
              chatId,
              source: 'callback_query',
              actionKey: data,
              message: `Flow multi toggle: ${slug} -> ${nodeText || nodeKey} toggled ${label}`,
              payload: { slug, nodeKey, nodeText, optionKey, label, callback_data: data }
            });
          } catch {}

          await this.flow.toggleMulti({ chatId, lang: userLang || 'en', nodeKey, optionKey });
        }

        else if (data.startsWith('flowmultidone:')) {
          const parts = data.split(':');
          const slug = parts[1];
          const nodeKey = parts[2];
          const userLang = await this.getUserLanguage(query.from.id, query.from.language_code);
          await this.flow.completeMulti({ chatId, lang: userLang || 'en', nodeKey });
        }

        else if (data.startsWith('flow:')) {
          const parts = data.split(':');
          const slug = parts[1];
          const nodeKey = parts[2];
          const optionKey = parts[3];

          const userLang = await this.getUserLanguage(query.from.id, query.from.language_code);

          // Log user selection so it appears in admin "User Requests"
          try {
            const label = await this.flow.getChoiceLabel({ slug, nodeKey, optionKey, lang: userLang || 'en' });
            const nodeText = await this.flow.getChoiceNodeText({ slug, nodeKey, lang: userLang || 'en' });
            await this.logUserRequest({
              sender: query.from,
              chatId,
              source: 'callback_query',
              actionKey: data,
              message: `Flow selection: ${slug} -> ${nodeText || nodeKey} = ${label}`,
              payload: { slug, nodeKey, nodeText, optionKey, label, callback_data: data }
            });
          } catch (e) {
            // ignore log errors
          }

          await this.flow.transition({ chatId, lang: userLang || 'en', answer: optionKey });
        }

        // Flow back
        else if (data.startsWith('flowback:')) {
          const userLang = await this.getUserLanguage(query.from.id, query.from.language_code);
          await this.flow.back({ chatId, lang: userLang || 'en' });
        }

        // Onboarding (single_choice)
        else if (data.startsWith('onb:')) {
          const parts = data.split(':');
          const questionId = parseInt(parts[1], 10);
          const optionKey = parts[2];

          const st = this.chatStates.get(chatId);
          if (st && st.mode === 'onboarding') {
            await this.saveOnboardingAnswer(st.userId, questionId, { answer_option_key: optionKey });
            st.questionIndex += 1;
            this.chatStates.set(chatId, st);
            await this.askNextOnboardingQuestion(chatId);
          }
        }

        // Disabled menu flow callbacks
        else if (data.startsWith('lang:')) {
          await this.bot.answerCallbackQuery(query.id).catch(() => {});
          return;
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
          await this.bot.answerCallbackQuery(query.id).catch(() => {});
          return;
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
          await this.bot.answerCallbackQuery(query.id).catch(() => {});
          return;
          const parts = data.split(':');
          const lang = parts[1];
          const country = parts[2];
          const topic = parts[3];

          await this.logUserRequest({
            sender: query.from,
            chatId,
            source: 'callback_query',
            actionKey: data,
            message: `User selected topic: ${topic} (lang=${lang}, country=${country})`,
            payload: { lang, country, topic, callback_data: data }
          });

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
