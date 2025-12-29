const express = require('express');
const pool = require('../config/database');
const router = express.Router();

// Get active promotions for users to engage with
router.get('/', async (req, res) => {
  try {
    const userId = req.telegramUser.id;
    
    // Get active promotions with task progress status
    const result = await pool.query(`
      WITH promotion_tasks AS (
        -- Channel join tasks
        SELECT 
          usp.id AS promotion_id,
          'channel_join' AS task_type,
          tc.id AS task_id,
          tp.status AS task_status,
          tp.points_earned
        FROM user_submitted_promotions usp
        JOIN telegram_channels tc ON tc.promotion_id = usp.id
        LEFT JOIN task_progress tp ON 
          tp.task_id = tc.id AND 
          tp.task_type = 'channel_join' AND 
          tp.user_id = $1
        WHERE usp.status = 'active' 
          AND usp.expires_at > NOW()
          AND tc.disabled = FALSE
        
        UNION ALL
        
        -- Video boost tasks
        SELECT 
          usp.id AS promotion_id,
          'youtube_video' AS task_type,
          yt.id AS task_id,
          tp.status AS task_status,
          tp.points_earned
        FROM user_submitted_promotions usp
        JOIN youtube_tasks yt ON yt.promotion_id = usp.id
        LEFT JOIN task_progress tp ON 
          tp.task_id = yt.id AND 
          tp.task_type = 'youtube_video' AND 
          tp.user_id = $1
        WHERE usp.status = 'active' 
          AND usp.expires_at > NOW()
          AND yt.disabled = FALSE
      )
      SELECT 
        usp.*,
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url,
        COALESCE(usp.promotion_data->>'completed_count', '0')::int AS completed_count,
        COALESCE(usp.promotion_data->>'pending_count', '0')::int AS pending_count,
        COALESCE(usp.promotion_data->>'total_points_awarded', '0')::int AS total_points_awarded,
        pt.task_type,
        pt.task_id,
        COALESCE(pt.task_status, 'not_started') AS task_status,
        COALESCE(pt.points_earned, 0) AS points_earned,
        CASE
          WHEN usp.current_views_joins >= usp.target_views_joins THEN true
          ELSE false
        END AS is_full
      FROM user_submitted_promotions usp
      LEFT JOIN telegram_users tu ON usp.user_id = tu.id
      LEFT JOIN promotion_tasks pt ON usp.id = pt.promotion_id
      WHERE usp.status = 'active' 
        AND usp.expires_at > NOW()
      ORDER BY usp.created_at DESC
    `, [userId]);
    
    // Group by promotion and add task info
    const promotionMap = new Map();
    
    for (const row of result.rows) {
      if (!promotionMap.has(row.id)) {
        // Initialize the promotion object
        const promotion = {
          id: row.id,
          user_id: row.user_id,
          type: row.type,
          title: row.title,
          description: row.description,
          target_url: row.target_url,
          target_views_joins: row.target_views_joins,
          budget_points: row.budget_points,
          budget_cash: row.budget_cash,
          expires_at: row.expires_at,
          status: row.status,
          current_views_joins: row.current_views_joins,
          created_at: row.created_at,
          updated_at: row.updated_at,
          cost_per_action: row.cost_per_action,
          reward_per_action: row.reward_per_action,
          admin_profit_per_action: row.admin_profit_per_action,
          username: row.username,
          first_name: row.first_name,
          last_name: row.last_name,
          photo_url: row.photo_url,
          completed_count: row.completed_count,
          pending_count: row.pending_count,
          total_points_awarded: row.total_points_awarded,
          is_full: row.is_full,
          task: null
        };
        
        promotionMap.set(row.id, promotion);
      }
      
      // Add task info if available
      if (row.task_id) {
        const promotion = promotionMap.get(row.id);
        
        // Add task info
        promotion.task = {
          type: row.task_type,
          task_id: row.task_id,
          status: row.task_status,
          points_earned: row.points_earned
        };
        
        // Add additional task details based on type
        if (row.task_type === 'channel_join') {
          // Get full channel info
          const channelResult = await pool.query(
            'SELECT * FROM telegram_channels WHERE id = $1',
            [row.task_id]
          );
          
          if (channelResult.rows.length > 0) {
            promotion.task.task_data = channelResult.rows[0];
          }
        } else if (row.task_type === 'youtube_video') {
          // Get full video info
          const videoResult = await pool.query(
            'SELECT * FROM youtube_tasks WHERE id = $1',
            [row.task_id]
          );
          
          if (videoResult.rows.length > 0) {
            promotion.task.task_data = videoResult.rows[0];
          }
        }
      }
    }
    
    const promotions = Array.from(promotionMap.values());
    res.json({ promotions });
  } catch (error) {
    console.error('Error fetching active promotions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router; 