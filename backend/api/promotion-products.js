const express = require('express');
const pool = require('../config/database');
const router = express.Router();

/**
 * Get all available promotion products
 * GET /api/promotion-products
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is blacklisted
    const blacklistCheck = await pool.query(
      'SELECT promotion_blacklisted FROM telegram_users WHERE id = $1',
      [userId]
    );
    
    if (blacklistCheck.rows[0]?.promotion_blacklisted) {
      return res.status(403).json({ 
        message: 'You are not eligible to participate in promotions at this time'
      });
    }

    const result = await pool.query(`
      SELECT 
        pp.*,
        COUNT(ps.id) AS total_submissions,
        COUNT(CASE WHEN ps.user_id = $1 THEN 1 END) AS user_submissions
      FROM promotion_products pp
      LEFT JOIN promotion_submissions ps ON ps.product_id = pp.id
      WHERE pp.is_active = TRUE
      GROUP BY pp.id
      ORDER BY pp.created_at DESC
    `, [userId]);

    res.json({
      products: result.rows
    });
  } catch (error) {
    console.error('Error fetching promotion products:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get a specific promotion product
 * GET /api/promotion-products/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is blacklisted
    const blacklistCheck = await pool.query(
      'SELECT promotion_blacklisted FROM telegram_users WHERE id = $1',
      [userId]
    );
    
    if (blacklistCheck.rows[0]?.promotion_blacklisted) {
      return res.status(403).json({ 
        message: 'You are not eligible to participate in promotions at this time'
      });
    }

    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const result = await pool.query(`
      SELECT 
        pp.*,
        COUNT(ps.id) AS total_submissions,
        COUNT(CASE WHEN ps.user_id = $1 THEN 1 END) AS user_submissions
      FROM promotion_products pp
      LEFT JOIN promotion_submissions ps ON ps.product_id = pp.id
      WHERE pp.id = $2 AND pp.is_active = TRUE
      GROUP BY pp.id
    `, [userId, productId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get reward tiers for this product
    const tiersResult = await pool.query(`
      SELECT * FROM promotion_pricing_tiers
      WHERE product_id = $1
      ORDER BY view_count ASC
    `, [productId]);

    res.json({
      product: result.rows[0],
      rewardTiers: tiersResult.rows
    });
  } catch (error) {
    console.error('Error fetching promotion product:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get analytics for specific product promotions
 * GET /api/promotion-products/:id/analytics
 */
router.get('/:id/analytics', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    // Get user's submissions for this product
    const submissionsResult = await pool.query(`
      SELECT 
        ps.id,
        ps.platform,
        ps.content_url,
        ps.claimed_views,
        ps.claimed_likes,
        ps.claimed_comments,
        ps.status,
        ps.points_awarded,
        ps.cash_awarded,
        ps.created_at,
        ps.updated_at,
        ps.reviewed_at
      FROM promotion_submissions ps
      WHERE ps.product_id = $1 AND ps.user_id = $2
      ORDER BY ps.created_at DESC
    `, [productId, userId]);

    // Get performance stats for this product
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COALESCE(SUM(claimed_views), 0) as total_views,
        COALESCE(SUM(claimed_likes), 0) as total_likes,
        COALESCE(SUM(claimed_comments), 0) as total_comments,
        COALESCE(SUM(points_awarded), 0) as total_points_earned,
        COALESCE(SUM(cash_awarded), 0) as total_cash_earned
      FROM promotion_submissions
      WHERE product_id = $1 AND user_id = $2
    `, [productId, userId]);

    res.json({
      submissions: submissionsResult.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching promotion product analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
