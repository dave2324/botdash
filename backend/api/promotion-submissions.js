const express = require('express');
const pool = require('../config/database');
const router = express.Router();
const { logger } = require('../config/logger');

/**
 * Get user's promotion submissions
 * GET /api/promotion-submissions
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check if user is blacklisted
    const blacklistCheck = await pool.query(
      'SELECT promotion_blacklisted, promotion_blacklisted_reason FROM telegram_users WHERE id = $1',
      [userId]
    );
    
    if (blacklistCheck.rows[0]?.promotion_blacklisted) {
      return res.status(403).json({ 
        message: 'You are not eligible to participate in promotions',
        reason: blacklistCheck.rows[0].promotion_blacklisted_reason || 'Please contact support for more information.'
      });
    }

    // Allow filtering by status
    const { status } = req.query;
    let query = `
      SELECT 
        ps.id,
        ps.product_id,
        ps.platform,
        ps.content_url,
        ps.claimed_views,
        ps.claimed_likes,
        ps.claimed_comments,
        ps.proof_url,
        ps.status,
        ps.admin_notes,
        ps.points_awarded,
        ps.cash_awarded,
        ps.created_at,
        ps.updated_at,
        ps.reviewed_at,
        pp.name AS product_name,
        pp.image_url AS product_image
      FROM promotion_submissions ps
      JOIN promotion_products pp ON ps.product_id = pp.id
      WHERE ps.user_id = $1
    `;
    
    const queryParams = [userId];
    
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      query += ` AND ps.status = $2`;
      queryParams.push(status);
    }
    
    query += ` ORDER BY ps.created_at DESC`;
    
    const result = await pool.query(query, queryParams);

    res.json({
      submissions: result.rows
    });
  } catch (error) {
    console.error('Error fetching promotion submissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Submit a new promotion claim
 * POST /api/promotion-submissions
 */
router.post('/', async (req, res) => {
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

    const {
      product_id,
      content_url,
      platform,
      claimed_views,
      claimed_likes,
      claimed_comments,
      proof_url,
      notes
    } = req.body;

    // Validate required fields
    if (!product_id || !content_url || !platform || !claimed_views || !proof_url) {
      return res.status(400).json({
        message: 'Missing required fields. Please provide product_id, content_url, platform, claimed_views, and proof_url.'
      });
    }

    // Validate views
    if (claimed_views < 100) {
      return res.status(400).json({
        message: 'Minimum 100 views required to submit a promotion claim'
      });
    }

    // Validate product exists and is active
    const productCheck = await pool.query(
      'SELECT * FROM promotion_products WHERE id = $1 AND is_active = TRUE',
      [product_id]
    );

    if (productCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found or inactive' });
    }

    // Check if this content URL has already been submitted
    const duplicateCheck = await pool.query(
      'SELECT * FROM promotion_submissions WHERE content_url = $1',
      [content_url]
    );

    if (duplicateCheck.rows.length > 0) {
      return res.status(400).json({ message: 'This content has already been submitted' });
    }

    // Validate URL format
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;
    if (!urlPattern.test(content_url)) {
      return res.status(400).json({ message: 'Invalid content URL format' });
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert the submission
      const submissionResult = await client.query(`
        INSERT INTO promotion_submissions (
          user_id, product_id, platform, content_url,
          claimed_views, claimed_likes, claimed_comments,
          proof_url, admin_notes, status, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *
      `, [
        userId, product_id, platform, content_url,
        claimed_views, claimed_likes || 0, claimed_comments || 0,
        proof_url, notes || null, 'pending'
      ]);

      await client.query('COMMIT');
      
      // Log submission for audit trail
      logger.info('New promotion submission created', {
        submission_id: submissionResult.rows[0].id,
        user_id: userId,
        product_id,
        platform,
        content_url,
        claimed_views
      });

      res.status(201).json({
        message: 'Promotion submission created successfully',
        submission: submissionResult.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating promotion submission:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get a specific promotion submission
 * GET /api/promotion-submissions/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const submissionId = parseInt(req.params.id);
    if (isNaN(submissionId)) {
      return res.status(400).json({ message: 'Invalid submission ID' });
    }

    const result = await pool.query(`
      SELECT 
        ps.*,
        pp.name AS product_name,
        pp.description AS product_description,
        pp.image_url AS product_image
      FROM promotion_submissions ps
      JOIN promotion_products pp ON ps.product_id = pp.id
      WHERE ps.id = $1 AND ps.user_id = $2
    `, [submissionId, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    res.json({
      submission: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching promotion submission:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
