const express = require('express');
const pool = require('../config/database');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// GET /api/promotion-participation/products
// Get all available promotion products for users
router.get('/products', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is blacklisted
    const userCheckResult = await pool.query(
      'SELECT promotion_blacklisted FROM telegram_users WHERE id = $1',
      [userId]
    );
    
    if (userCheckResult.rows[0]?.promotion_blacklisted) {
      return res.status(403).json({ 
        message: 'Your account has been restricted from participating in promotions',
        blacklisted: true 
      });
    }

    // Get active products with their pricing tiers
    const result = await pool.query(`
      SELECT 
        pp.*,
        json_agg(
          json_build_object(
            'id', ppt.id,
            'view_count', ppt.view_count,
            'points_reward', ppt.points_reward,
            'cash_reward', ppt.cash_reward,
            'description', ppt.description
          ) ORDER BY ppt.view_count
        ) as pricing_tiers
      FROM promotion_products pp
      LEFT JOIN promotion_pricing_tiers ppt ON pp.id = ppt.product_id
      WHERE pp.is_active = TRUE
      GROUP BY pp.id
      ORDER BY pp.created_at DESC
    `);

    res.json({ 
      products: result.rows.map(row => ({
        ...row,
        pricing_tiers: row.pricing_tiers[0].id ? row.pricing_tiers : []
      }))
    });
  } catch (error) {
    console.error('Error fetching promotion products:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/promotion-participation/submissions
// Get user's promotion submissions
router.get('/submissions', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await pool.query(`
      SELECT 
        ps.*,
        pp.name as product_name,
        pp.description as product_description,
        pp.image_url as product_image
      FROM promotion_submissions ps
      JOIN promotion_products pp ON ps.product_id = pp.id
      WHERE ps.user_id = $1
      ORDER BY ps.created_at DESC
    `, [userId]);

    res.json({ submissions: result.rows });
  } catch (error) {
    console.error('Error fetching promotion submissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/promotion-participation/submissions
// Submit a new promotion with Supabase image URL
router.post('/submissions', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is blacklisted
    const userCheckResult = await pool.query(
      'SELECT promotion_blacklisted FROM telegram_users WHERE id = $1',
      [userId]
    );
    
    if (userCheckResult.rows[0]?.promotion_blacklisted) {
      return res.status(403).json({ 
        message: 'Your account has been restricted from participating in promotions' 
      });
    }

    const { 
      productId, 
      platform, 
      contentUrl, 
      claimedViews, 
      claimedLikes, 
      claimedComments,
      proofImageUrl
    } = req.body;

    // Validate required fields
    if (!productId || !platform || !contentUrl || !claimedViews || !proofImageUrl) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate URL format
    const validPlatforms = ['youtube', 'tiktok', 'instagram', 'facebook', 'twitter', 'other'];
    if (!validPlatforms.includes(platform.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid platform' });
    }

    // Verify product exists and is active
    const productCheck = await pool.query(
      'SELECT id FROM promotion_products WHERE id = $1 AND is_active = TRUE',
      [productId]
    );
    
    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found or inactive' });
    }

    // Check if this content URL was already submitted
    const dupCheck = await pool.query(
      'SELECT id FROM promotion_submissions WHERE content_url = $1',
      [contentUrl]
    );
    
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ message: 'This content has already been submitted' });
    }

    // Get proof URL from request body (Supabase URL)
    const proofUrl = proofImageUrl;

    // Insert submission
    const result = await pool.query(`
      INSERT INTO promotion_submissions (
        user_id, product_id, platform, content_url, 
        claimed_views, claimed_likes, claimed_comments, proof_url,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING *
    `, [
      userId, 
      productId, 
      platform.toLowerCase(), 
      contentUrl, 
      claimedViews,
      claimedLikes || null, 
      claimedComments || null, 
      proofUrl,
      'pending'
    ]);

    res.status(201).json({ 
      message: 'Promotion submission received and is pending review',
      submission: result.rows[0]
    });
  } catch (error) {
    console.error('Error submitting promotion:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
