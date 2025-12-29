const express = require('express');
const { adminAuth } = require('./auth');

const pool = require('../config/database');

const router = express.Router();

/**
 * Get overall promotion statistics for admin dashboard
 * @route GET /admin/promotion-stats/overall
 */
router.get('/overall', adminAuth, async (req, res) => {
  try {
    // Use transaction for consistent reads
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get counts by status
      const statusResult = await client.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM user_submitted_promotions
        GROUP BY status
      `);

      // Get counts by type
      const typeResult = await client.query(`
        SELECT 
          type,
          COUNT(*) as count
        FROM user_submitted_promotions
        GROUP BY type
      `);

      // Get total engagement metrics
      const engagementResult = await client.query(`
        SELECT 
          SUM(current_views_joins) as total_engagements,
          SUM((promotion_stats->>'total_points_distributed')::int) as total_points_distributed,
          SUM((promotion_stats->>'total_admin_profit')::int) as total_admin_profit
        FROM user_submitted_promotions
        WHERE status IN ('active', 'completed', 'budget_exhausted')
      `);

      // Get daily engagement metrics for the last 30 days
      const dailyResult = await client.query(`
        SELECT 
          DATE_TRUNC('day', created_at) as date,
          COUNT(*) as engagements,
          SUM(points_awarded) as points_awarded
        FROM user_promotion_engagements
        WHERE created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY date DESC
      `);

      // Get top promoters
      const topPromotersResult = await client.query(`
        SELECT 
          usp.user_id,
          tu.username,
          tu.first_name,
          tu.last_name,
          COUNT(DISTINCT usp.id) as promotion_count,
          SUM(usp.current_views_joins) as total_engagements
        FROM user_submitted_promotions usp
        JOIN telegram_users tu ON usp.user_id = tu.id
        WHERE usp.status IN ('active', 'completed', 'budget_exhausted')
        GROUP BY usp.user_id, tu.username, tu.first_name, tu.last_name
        ORDER BY total_engagements DESC
        LIMIT 10
      `);

      await client.query('COMMIT');

      // Format and return data
      const stats = {
        status: statusResult.rows.reduce((acc, row) => {
          acc[row.status] = parseInt(row.count);
          return acc;
        }, {}),
        
        type: typeResult.rows.reduce((acc, row) => {
          acc[row.type] = parseInt(row.count);
          return acc;
        }, {}),
        
        engagement: engagementResult.rows[0] ? {
          total_engagements: parseInt(engagementResult.rows[0].total_engagements || 0),
          total_points_distributed: parseInt(engagementResult.rows[0].total_points_distributed || 0),
          total_admin_profit: parseInt(engagementResult.rows[0].total_admin_profit || 0)
        } : {
          total_engagements: 0,
          total_points_distributed: 0,
          total_admin_profit: 0
        },
        
        daily: dailyResult.rows.map(row => ({
          date: row.date,
          engagements: parseInt(row.engagements),
          points_awarded: parseInt(row.points_awarded)
        })),
        
        topPromoters: topPromotersResult.rows.map(row => ({
          user_id: row.user_id,
          username: row.username,
          first_name: row.first_name,
          last_name: row.last_name,
          promotion_count: parseInt(row.promotion_count),
          total_engagements: parseInt(row.total_engagements)
        }))
      };

      res.json({ stats });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting promotion statistics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Get detailed stats for a specific promotion
 * @route GET /admin/promotion-stats/:id
 */
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Use transaction for consistent reads
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get promotion details
      const promotionResult = await client.query(`
        SELECT 
          usp.*,
          tu.username,
          tu.first_name,
          tu.last_name,
          tu.photo_url
        FROM user_submitted_promotions usp
        LEFT JOIN telegram_users tu ON usp.user_id = tu.id
        WHERE usp.id = $1
      `, [id]);
      
      if (promotionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Promotion not found' });
      }
      
      const promotion = promotionResult.rows[0];

      // Get hourly engagement metrics
      const hourlyResult = await client.query(`
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as count
        FROM user_promotion_engagements
        WHERE promotion_id = $1
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `, [id]);

      // Get daily engagement metrics
      const dailyResult = await client.query(`
        SELECT 
          DATE_TRUNC('day', created_at) as day,
          COUNT(*) as count
        FROM user_promotion_engagements
        WHERE promotion_id = $1
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day DESC
      `, [id]);

      // Get engagement types breakdown
      const engagementTypesResult = await client.query(`
        SELECT 
          engagement_type,
          COUNT(*) as count,
          SUM(points_awarded) as points_awarded
        FROM user_promotion_engagements
        WHERE promotion_id = $1
        GROUP BY engagement_type
      `, [id]);

      // Get latest engagements
      const latestResult = await client.query(`
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
        LIMIT 50
      `, [id]);

      await client.query('COMMIT');

      // Format and return data
      const stats = {
        promotion,
        hourlyEngagement: hourlyResult.rows.map(row => ({
          hour: row.hour,
          count: parseInt(row.count)
        })),
        dailyEngagement: dailyResult.rows.map(row => ({
          day: row.day,
          count: parseInt(row.count)
        })),
        engagementTypes: engagementTypesResult.rows.reduce((acc, row) => {
          acc[row.engagement_type] = {
            count: parseInt(row.count),
            points_awarded: parseInt(row.points_awarded)
          };
          return acc;
        }, {}),
        latestEngagements: latestResult.rows
      };

      res.json({ stats });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error getting promotion statistics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Update promotion statistics (recalculate if necessary)
 * @route POST /admin/promotion-stats/:id/recalculate
 */
router.post('/:id/recalculate', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Use transaction for consistency
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get promotion
      const promotionResult = await client.query(`
        SELECT * FROM user_submitted_promotions WHERE id = $1
      `, [id]);
      
      if (promotionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Promotion not found' });
      }
      
      const promotion = promotionResult.rows[0];

      // Get all engagements for this promotion
      const engagementsResult = await client.query(`
        SELECT 
          COUNT(*) as total_engagements,
          SUM(points_awarded) as total_points_awarded
        FROM user_promotion_engagements
        WHERE promotion_id = $1
      `, [id]);
      
      const totalEngagements = parseInt(engagementsResult.rows[0]?.total_engagements || 0);
      const totalPointsAwarded = parseInt(engagementsResult.rows[0]?.total_points_awarded || 0);
      
      // Calculate admin profit
      const adminProfit = totalEngagements * promotion.admin_profit_per_action;
      
      // Calculate held balance
      const totalBudget = promotion.target_views_joins * promotion.cost_per_action;
      const spentBudget = totalEngagements * promotion.cost_per_action;
      const heldBalance = Math.max(0, totalBudget - spentBudget);
      
      // Update promotion stats
      await client.query(`
        UPDATE user_submitted_promotions
        SET 
          current_views_joins = $1,
          promotion_stats = jsonb_build_object(
            'total_engagements', $1,
            'total_points_distributed', $2,
            'total_admin_profit', $3,
            'held_balance', $4
          ),
          updated_at = NOW()
        WHERE id = $5
      `, [
        totalEngagements,
        totalPointsAwarded,
        adminProfit,
        heldBalance,
        id
      ]);
      
      // Check if promotion should be updated based on progress
      if (promotion.status === 'active') {
        if (totalEngagements >= promotion.target_views_joins) {
          // Target reached, mark as completed
          await client.query(`
            UPDATE user_submitted_promotions
            SET status = 'completed', updated_at = NOW()
            WHERE id = $1
          `, [id]);
        } else if (heldBalance < promotion.cost_per_action) {
          // Budget exhausted
          await client.query(`
            UPDATE user_submitted_promotions
            SET status = 'budget_exhausted', updated_at = NOW()
            WHERE id = $1
          `, [id]);
        }
      }

      // Get updated promotion
      const updatedPromotionResult = await client.query(`
        SELECT * FROM user_submitted_promotions WHERE id = $1
      `, [id]);

      await client.query('COMMIT');
      
      res.json({ 
        message: 'Promotion statistics recalculated successfully',
        promotion: updatedPromotionResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error recalculating promotion statistics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
