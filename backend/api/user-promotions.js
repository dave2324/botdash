const express = require('express');
const pool = require('../config/database');
const { createBot } = require('../bot');
const router = express.Router();

// Submit a new promotion
router.post('/', async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const {
      type,
      title,
      description,
      target_url,
      target_views_joins,
      budget_points,
      budget_cash,
      expires_at,
      validation_questions,
      vpn_countries
    } = req.body;

    // Validate required fields
    if (!type || !title || !description || !target_url || !expires_at) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate type
    if (!['channel_join', 'video_boost'].includes(type)) {
      return res.status(400).json({ message: 'Invalid promotion type' });
    }

    // Get cost per action for this type of promotion
    const costSettingsResult = await pool.query(`
      SELECT calculate_promotion_cost_per_action($1) as cost_per_action,
             (SELECT value FROM settings WHERE key = $2) as reward_per_action,
             (SELECT value FROM settings WHERE key = $3) as admin_profit_per_action
    `, [
      type,
      type === 'channel_join' ? 'channel_join_reward_points' : 'video_boost_reward_points',
      type === 'channel_join' ? 'channel_join_admin_profit' : 'video_boost_admin_profit'
    ]);

    const costPerAction = parseInt(costSettingsResult.rows[0].cost_per_action) || 0;
    const rewardPerAction = parseInt(costSettingsResult.rows[0].reward_per_action) || 0;
    const adminProfitPerAction = parseInt(costSettingsResult.rows[0].admin_profit_per_action) || 0;

    // Determine how to calculate target or budget
    let calculatedTarget = target_views_joins;
    let calculatedBudget = budget_points;

    if (!target_views_joins && !budget_points && !budget_cash) {
      return res.status(400).json({ message: 'Must specify either target_views_joins or a budget (points/cash)' });
    }

    // If budget is provided but not target, calculate maximum possible target
    if ((budget_points || budget_cash) && !target_views_joins) {
      if (budget_points) {
        calculatedTarget = Math.floor(budget_points / costPerAction);
      } else {
        // For cash budget, we would need a cash-to-points conversion rate
        // This is just placeholder logic
        const cashToPointsRate = 10; // $1 = 10 points, for example
        const equivalentPoints = budget_cash * cashToPointsRate;
        calculatedTarget = Math.floor(equivalentPoints / costPerAction);
      }
    }
    // If target is provided but not budget, calculate required budget
    else if (target_views_joins && !budget_points && !budget_cash) {
      calculatedBudget = target_views_joins * costPerAction;
    }

    // Validate expiry date
    const expiryDate = new Date(expires_at);
    if (expiryDate <= new Date()) {
      return res.status(400).json({ message: 'Expiry date must be in the future' });
    }

    // Check if user has enough points if using points budget
    if (calculatedBudget) {
      const userResult = await pool.query('SELECT points FROM telegram_users WHERE id = $1', [userId]);
      if (userResult.rows.length === 0) {
        return res.status(404).json({ message: 'User not found' });
      }
      
      const userPoints = userResult.rows[0].points;
      if (userPoints < calculatedBudget) {
        return res.status(400).json({ message: 'Insufficient points for this budget' });
      }
    }

    // Verify bot is added to the target chat for channel_join promotions
    if (type === 'channel_join') {
      try {
        const bot = await createBot();
        
        // Extract channel identifier from target_url
        let channelIdentifier = '';
        if (target_url.includes('t.me/')) {
          const path = target_url.split('t.me/')[1].split('?')[0].split('/')[0];
          // Handle private links (https://t.me/+hash)
          if (path.startsWith('+')) {
            channelIdentifier = path; // Keep the + prefix for private links
          } else {
            channelIdentifier = path;
          }
        } else if (target_url.startsWith('@')) {
          channelIdentifier = target_url.substring(1);
        } else if (target_url.startsWith('https://telegram.me/')) {
          const path = target_url.split('telegram.me/')[1].split('?')[0].split('/')[0];
          // Handle private links (https://telegram.me/+hash)
          if (path.startsWith('+')) {
            channelIdentifier = path; // Keep the + prefix for private links
          } else {
            channelIdentifier = path;
          }
        } else if (target_url.match(/^-100\d+$/)) {
          // Handle channel ID format (e.g., -1002490210049)
          channelIdentifier = target_url;
        } else {
          // Assume it's a direct username or channel ID
          channelIdentifier = target_url;
        }
        
        // Remove any trailing slashes or parameters
        channelIdentifier = channelIdentifier.replace(/\/+$/, '');
        
        // Check if bot is added to the channel
        await bot.getChannelInfo(channelIdentifier);
      } catch (error) {
        const botUsername = process.env.BOT_USERNAME || 'your_bot';
        return res.status(400).json({ 
          message: `Channel verification failed. Please ensure @${botUsername} is added as an admin to the target channel and the channel exists.`,
          details: error.message 
        });
      }
    }

    // Start a transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Create the initial promotion_stats JSON
      const initialPromotionStats = {
        total_engagements: 0,
        total_points_distributed: 0,
        total_admin_profit: 0,
        held_balance: calculatedBudget || 0
      };
      
      // Create the promotion
      const result = await client.query(`
        INSERT INTO user_submitted_promotions (
          user_id, type, title, description, target_url, target_views_joins,
          budget_points, budget_cash, expires_at,
          cost_per_action, reward_per_action, admin_profit_per_action,
          promotion_stats, validation_questions, vpn_countries
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        userId, type, title, description, target_url, calculatedTarget,
        calculatedBudget, budget_cash, expiryDate,
        costPerAction, rewardPerAction, adminProfitPerAction,
        JSON.stringify(initialPromotionStats),
        validation_questions ? JSON.stringify(validation_questions) : null,
        vpn_countries || []
      ]);

      // Deduct points and add to locked_points if using points budget
      if (calculatedBudget) {
        await client.query(`
          UPDATE telegram_users 
          SET 
            points = points - $1,
            locked_points = locked_points + $1
          WHERE id = $2
        `, [calculatedBudget, userId]);
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({ 
        message: 'Promotion submitted successfully for review', 
        promotion: result.rows[0] 
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error submitting promotion:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get user's promotions
router.get('/', async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const { status, type } = req.query;
    
    let whereClause = 'WHERE usp.user_id = $1';
    let queryParams = [userId];
    let paramCount = 1;
    
    if (status) {
      paramCount++;
      whereClause += ` AND usp.status = $${paramCount}`;
      queryParams.push(status);
    }
    
    if (type) {
      paramCount++;
      whereClause += ` AND usp.type = $${paramCount}`;
      queryParams.push(type);
    }
    
    const result = await pool.query(`
      SELECT 
        usp.*,
        COUNT(upe.id) as total_engagements
      FROM user_submitted_promotions usp
      LEFT JOIN user_promotion_engagements upe ON usp.id = upe.promotion_id
      ${whereClause}
      GROUP BY usp.id
      ORDER BY usp.created_at DESC
    `, queryParams);
    
    res.json({ promotions: result.rows });
  } catch (error) {
    console.error('Error fetching user promotions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get specific promotion by ID
router.get('/:id', async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        usp.*,
        COUNT(upe.id) as total_engagements
      FROM user_submitted_promotions usp
      LEFT JOIN user_promotion_engagements upe ON usp.id = upe.promotion_id
      WHERE usp.id = $1 AND usp.user_id = $2
      GROUP BY usp.id
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Promotion not found' });
    }
    
    // Get engagements for this promotion
    const engagementsResult = await pool.query(`
      SELECT 
        upe.*,
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url
      FROM user_promotion_engagements upe
      LEFT JOIN telegram_users tu ON upe.user_id = tu.id
      WHERE upe.promotion_id = $1
      ORDER BY upe.created_at DESC
    `, [id]);
    
    res.json({
      promotion: result.rows[0],
      engagements: engagementsResult.rows
    });
  } catch (error) {
    console.error('Error fetching user promotion:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Note: Engagement with promotions is now handled directly in telegram-channels.js and video-tasks.js
// This means users engage with promotions naturally by completing the associated tasks

module.exports = router; 