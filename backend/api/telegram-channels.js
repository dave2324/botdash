const express = require('express');
const pool = require('../config/database');
const { Api } = require('telegram');
const { TelegramClient } = require('telegram');
const { StoreSession } = require('telegram/sessions');

// Helper function to extract channel identifier from various formats
const getChannelIdentifier = (channel) => {
  // From link
  if (channel.link && channel.link.includes('t.me/')) {
    // Handle t.me links
    const path = channel.link.split('t.me/')[1].split('?')[0].split('/')[0];
    return path;
  } 
  // From @ username format
  else if (channel.link && channel.link.startsWith('@')) {
    return channel.link.substring(1);
  }
  // From numeric channel ID
  else if (channel.name && channel.name.match(/^-100\d+$/)) {
    return channel.name;
  }
  // Default to channel name
  else {
    return channel.name;
  }
};

// Initialize Telegram client
let client = null;
const initClient = async () => {
  if (!client) {
    client = new TelegramClient(
      new StoreSession('bot_sessions'),
      process.env.API_ID,
      process.env.API_HASH,
      {
        connectionRetries: 5,
        baseLogger: console
      }
    );
    await client.start({
      botAuthToken: process.env.BOT_TOKEN
    });
  }
  return client;
};

const router = express.Router();

// GET /api/telegram-channels
const { getTaskDependencyDetail } = require('./task-utils');
router.get('/', async (req, res) => {
  try {
    // req.telegramUser is set by the auth middleware
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // First check if user is suspended from earning tasks due to leaving channels
    const userResult = await pool.query(
      `SELECT earning_tasks_suspended, tasks_suspended_reason, has_left_channels
       FROM telegram_users
       WHERE id = $1`,
      [userId]
    );
    
    const userStatus = userResult.rows[0] || {};
    const isSuspended = userStatus.earning_tasks_suspended || false;
    const suspensionReason = userStatus.tasks_suspended_reason || 'You have left Telegram channels you were paid to join. Please rejoin to continue earning.';

    // Get active telegram channels and check if user has joined them
    const result = await pool.query(
      `SELECT 
        c.*,
        COALESCE(tp.status, 'not_started') as status,
        COALESCE(tp.points_earned, 0) as points_earned,
        COALESCE(tp.membership_status, 'active') as membership_status,
        c.require_premium
       FROM telegram_channels c
       LEFT JOIN task_progress tp ON 
         tp.task_id = c.id AND 
         tp.task_type = 'channel_join' AND 
         tp.user_id = $1
       WHERE c.disabled = FALSE
         AND (c.expires_at IS NULL OR c.expires_at > NOW())
       ORDER BY 
         CASE WHEN tp.membership_status = 'left' THEN 0 ELSE 1 END,
         c.created_at DESC`,
      [userId]
    );

    // Add isLocked flag and filter channels based on task dependencies
    const channels = await Promise.all(result.rows.map(async (channel) => {
      let isLocked = false;
      let require_finish_task_detail = null;
      if (channel.require_finish_task_id && channel.require_finish_task_type) {
        const taskCompletion = await pool.query(
          `SELECT 1 FROM task_progress WHERE user_id = $1 AND task_id = $2 AND task_type = $3 AND status = 'completed'`,
          [userId, channel.require_finish_task_id, channel.require_finish_task_type]
        );
        if (taskCompletion.rows.length === 0) {
          isLocked = true;
        }
        require_finish_task_detail = await getTaskDependencyDetail(channel.require_finish_task_type, channel.require_finish_task_id);
      }
      return { ...channel, isLocked, require_finish_task_detail };
    }));

    // Return channels along with suspension status
    res.json({ 
      channels,
      userStatus: {
        isSuspended,
        suspensionReason,
        hasLeftChannels: userStatus.has_left_channels || false
      }
    });
  } catch (error) {
    console.error('Error fetching telegram channels:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/telegram-channels/:id/join
router.post('/:id/join', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const channelId = parseInt(req.params.id);
    if (isNaN(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    // Check if channel exists and is not disabled
    const channelResult = await pool.query(
      'SELECT * FROM telegram_channels WHERE id = $1 AND disabled = FALSE',
      [channelId]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Channel not found or disabled' });
    }

    const channel = channelResult.rows[0];
    let inviteLink = channel.link;

    // For private channels, generate a fresh invite link
    if (channel.is_private) {
      try {
        const telegramClient = await initClient();
        
        // Determine the peer based on channel identifier
        const channelIdentifier = getChannelIdentifier(channel);
        let peer;
        if (channelIdentifier.match(/^-100\d+$/)) {
          // Channel ID format
          peer = parseInt(channelIdentifier);
        } else if (channelIdentifier.startsWith('+')) {
          // Private invite link format
          peer = channelIdentifier;
        } else {
          // Username format
          peer = channelIdentifier;
        }

        // Export chat invite using the GramJS API
        const result = await telegramClient.invoke(
          new Api.messages.ExportChatInvite({
            peer: peer,
            legacyRevokePermanent: false,
            requestNeeded: false,
            expireDate: undefined,
            usageLimit: undefined,
            title: undefined
          })
        );

        if (result && result.link) {
          inviteLink = result.link;
        }
      } catch (error) {
        console.error('Error exporting chat invite:', error);
        // Fall back to the original link if export fails
      }
    }

    // Create or update task progress
    const result = await pool.query(
      `INSERT INTO task_progress 
        (user_id, task_type, task_id, status, points_earned, updated_at)
       VALUES ($1, 'channel_join', $2, 'pending', 0, NOW())
       ON CONFLICT (user_id, task_type, task_id)
       DO UPDATE SET 
         status = 'pending',
         updated_at = NOW()
       RETURNING *`,
      [userId, channelId]
    );

    res.json({ 
      message: 'Join request recorded',
      taskProgress: result.rows[0],
      inviteLink: inviteLink
    });
  } catch (error) {
    console.error('Error recording channel join:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/telegram-channels/rejoin-verification
router.post('/rejoin-verification', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    // Get channels the user has left
    const leftChannelsResult = await pool.query(`
      SELECT tp.task_id, tc.name, tc.title, tc.link
      FROM task_progress tp 
      JOIN telegram_channels tc ON tp.task_id = tc.id
      WHERE tp.user_id = $1 
        AND tp.task_type = 'channel_join' 
        AND tp.membership_status = 'left'
    `, [userId]);
    
    if (leftChannelsResult.rows.length === 0) {
      // Update user status if no channels are left
      await pool.query(`
        UPDATE telegram_users
        SET has_left_channels = FALSE, 
            earning_tasks_suspended = FALSE,
            tasks_suspended_reason = NULL
        WHERE id = $1
      `, [userId]);
      
      return res.json({
        success: true,
        message: 'No channels need rejoining',
        channelsToRejoin: []
      });
    }
    
    return res.json({
      success: true,
      channelsToRejoin: leftChannelsResult.rows
    });
  } catch (error) {
    console.error('Error fetching channels to rejoin:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/telegram-channels/:id/verify
router.post('/:id/verify', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const channelId = parseInt(req.params.id);
    if (isNaN(channelId)) {
      return res.status(400).json({ message: 'Invalid channel ID' });
    }

    // Get channel info with promotion data
    const channelResult = await pool.query(
      `SELECT c.*, p.id as promotion_id, p.reward_per_action
       FROM telegram_channels c
       LEFT JOIN user_submitted_promotions p ON c.promotion_id = p.id 
         AND (p.status = 'active' OR p.status = 'approved')
         AND p.current_views_joins < p.target_views_joins
         AND p.expires_at > NOW()
       WHERE c.id = $1 AND c.disabled = FALSE`,
      [channelId]
    );

    if (channelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Channel not found or disabled' });
    }

    const channel = channelResult.rows[0];

    try {
      // Get channel identifier using common function
      const channelIdentifier = getChannelIdentifier(channel);
      
      // Initialize and get client
      const telegramClient = await initClient();
      
      try {
        // Get channel entity with proper handling
        let channelEntity;
        try {
          // Try getting entity by username or string identifier
          channelEntity = await telegramClient.getEntity(channelIdentifier);
        } catch (error) {
          // If that fails and it's a numeric ID, try parsing it as an integer
          if (channelIdentifier.match(/^-100\d+$/)) {
            try {
              channelEntity = await telegramClient.getEntity(parseInt(channelIdentifier));
            } catch (innerError) {
              console.error('Failed to get entity by parsed ID:', innerError);
              throw error;
            }
          } else {
            throw error;
          }
        }
        
        // Check if user is a member using Telegram API
        const participant = await telegramClient.invoke(new Api.channels.GetParticipant({
          channel: channelEntity,
          participant: parseInt(userId) // Ensure userId is parsed as integer
        }));

        if (participant && participant.participant) {
          // Start a database transaction
          const client = await pool.connect();
          try {
            await client.query('BEGIN');

            // Fetch points reward from settings
            const settingsResult = await client.query(
              "SELECT value FROM settings WHERE key = 'points_on_channel_join'"
            );
            const POINTS_REWARD = parseInt(settingsResult.rows[0]?.value) || 30;

            // Check if this channel is part of a user promotion by directly checking the promotion_id column
            // First get the channel with its promotion_id and make sure the promotion is valid
            const channelWithPromotionResult = await client.query(
              `SELECT tc.id as channel_id, tc.promotion_id, 
                     usp.id, usp.status, usp.current_views_joins, usp.target_views_joins, 
                     usp.expires_at, usp.reward_per_action, usp.cost_per_action, usp.admin_profit_per_action,
                     usp.user_id
               FROM telegram_channels tc
               LEFT JOIN user_submitted_promotions usp ON tc.promotion_id = usp.id
               WHERE tc.id = $1 
                 AND tc.promotion_id IS NOT NULL
                 AND usp.id IS NOT NULL
                 AND (usp.status = 'active' OR usp.status = 'approved')
                 AND usp.current_views_joins < usp.target_views_joins
                 AND usp.expires_at > NOW()`,
              [channelId]
            );
            
            // Check if promotion_id exists and is valid
            const isUserPromotion = channelWithPromotionResult.rows.length > 0;
                                   
            // We already have the promotion data from channelWithPromotionResult
            let promotionResult = { rows: [] };
            if (isUserPromotion) {
              // Just reuse the data we already have
              promotionResult = {
                rows: [channelWithPromotionResult.rows[0]]
              };
            }
            let pointsToAward = POINTS_REWARD;
            
            if (isUserPromotion && promotionResult.rows.length > 0) {
              const promotion = promotionResult.rows[0];
              
              // Check if user already completed this promotion task
              const alreadyCompletedCheck = await client.query(
                `SELECT 1 FROM user_promotion_engagements 
                 WHERE user_id = $1 AND promotion_id = $2 AND engagement_type = $3`,
                [userId, promotion.id, 'join']
              );
              
              if (alreadyCompletedCheck.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                  message: 'You have already completed this promotion task',
                  success: false
                });
              }
              
              // Get promotion owner info to update their locked points
              const promoterResult = await client.query(
                `SELECT id, locked_points FROM telegram_users WHERE id = $1`,
                [promotion.user_id]
              );
              
              if (promoterResult.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                  message: 'Promotion owner account not found',
                  success: false
                });
              }
              
              const promoter = promoterResult.rows[0];
              const costPerAction = promotion.cost_per_action || 0;
              const rewardPerAction = promotion.reward_per_action || 0;
              const adminProfit = promotion.admin_profit_per_action || costPerAction - rewardPerAction;
              
              // Make sure promoter has enough locked points
              if (promoter.locked_points < costPerAction) {
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                  message: 'This promotion has reached its budget limit',
                  success: false
                });
              }
              
              // 1. Reduce locked points from promoter
              await client.query(
                `UPDATE telegram_users SET locked_points = locked_points - $1 WHERE id = $2`,
                [costPerAction, promotion.user_id]
              );
              
              // 2. Insert engagement record
              if (promotion && promotion.id) {
                await client.query(
                  `INSERT INTO user_promotion_engagements 
                    (user_id, promotion_id, engagement_type, points_awarded)
                   VALUES ($1, $2, $3, $4)`,
                  [userId, promotion.id, 'join', rewardPerAction]
                );
              } else {
                // This should never happen as we already checked for valid promotion,
                // but adding as an extra safeguard
                await client.query('ROLLBACK');
                return res.status(400).json({ 
                  message: 'Invalid promotion data',
                  success: false
                });
              }
              
              // 3. Update promotion stats
              await client.query(
                `UPDATE user_submitted_promotions 
                 SET current_views_joins = current_views_joins + 1,
                     promotion_stats = jsonb_set(
                       jsonb_set(
                         jsonb_set(
                           jsonb_set(
                             COALESCE(promotion_stats, '{}'::jsonb),
                             '{total_engagements}',
                             (COALESCE((promotion_stats->>'total_engagements')::int, 0) + 1)::text::jsonb
                           ),
                           '{total_points_distributed}',
                           (COALESCE((promotion_stats->>'total_points_distributed')::int, 0) + $1)::text::jsonb
                         ),
                         '{total_admin_profit}',
                         (COALESCE((promotion_stats->>'total_admin_profit')::int, 0) + $2)::text::jsonb
                       ),
                       '{held_balance}',
                       (COALESCE((promotion_stats->>'held_balance')::int, 0) - $3)::text::jsonb
                     ),
                     updated_at = NOW(),
                     status = CASE 
                       WHEN current_views_joins + 1 >= target_views_joins THEN 'completed'
                       ELSE status 
                     END
                 WHERE id = $4`,
                [rewardPerAction, adminProfit, costPerAction, promotion.id]
              );
              
              // Set the points reward to the promotion reward
              pointsToAward = rewardPerAction;
              
              // Update task progress to link with promotion
              await client.query(
                `UPDATE task_progress 
                 SET metadata = jsonb_set(metadata, '{promotion_id}', $1::text::jsonb) 
                 WHERE user_id = $2 AND task_id = $3 AND task_type = 'channel_join'`,
                [promotion.id.toString(), userId, channelId]
              );
            }

            // 1. Update task_progress
            const progressResult = await client.query(
              `UPDATE task_progress 
               SET status = 'completed', 
                   points_earned = $1,
                   updated_at = NOW()
               WHERE user_id = $2 
                 AND task_type = 'channel_join' 
                 AND task_id = $3
               RETURNING *`,
              [pointsToAward, userId, channelId]
            );

            // 2. Record in user_tasks (only for non-promotion tasks)
            if (!isUserPromotion) {
              await client.query(
                `INSERT INTO user_tasks (user_id, task_id, completed_at, points_awarded)
                 VALUES ($1, 
                        (SELECT id FROM tasks WHERE type = 'channel' AND is_active = TRUE LIMIT 1),
                        NOW(),
                        $2)
                 ON CONFLICT (user_id, task_id) DO NOTHING`,
                [userId, pointsToAward]
              );
            }

            // 3. Add points to user's balance
            await client.query(
              'SELECT add_points_to_user($1, $2)',
              [userId, pointsToAward]
            );

            await client.query('COMMIT');

            res.json({
              success: true,
              message: 'Channel membership verified and task completed',
              taskProgress: progressResult.rows[0]
            });
          } catch (error) {
            await client.query('ROLLBACK');
            throw error;
          } finally {
            client.release();
          }
        } else {
          res.json({
            success: false,
            message: 'User is not a member of the channel'
          });
        }
      } catch (error) {
        console.error('Error getting channel participant:', error);
        res.json({
          success: false,
          message: 'Failed to verify channel membership. Please make sure you have joined the channel.'
        });
      }
    } catch (error) {
      console.error('Error checking channel membership:', error);
      res.json({
        success: false,
        message: 'Failed to verify channel membership. Please try again later.'
      });
    }
  } catch (error) {
    console.error('Error verifying channel join:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 