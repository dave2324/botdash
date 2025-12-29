const express = require('express');
const pool = require('../config/database');
const { adminAuth } = require('./auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Get all local ads
router.get('/', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, ad_type } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      whereClause += ` AND status = $${paramCount}`;
      queryParams.push(status);
    }
    
    if (ad_type) {
      paramCount++;
      whereClause += ` AND ad_type = $${paramCount}`;
      queryParams.push(ad_type);
    }
    
    const result = await pool.query(`
      SELECT 
        la.*,
        COALESCE(ai.impression_count, 0) as impression_count,
        COALESCE(ac.click_count, 0) as click_count,
        CASE 
          WHEN COALESCE(ai.impression_count, 0) > 0 
          THEN ROUND((COALESCE(ac.click_count, 0)::numeric / ai.impression_count * 100), 2)
          ELSE 0 
        END as ctr_percentage
      FROM local_ads la
      LEFT JOIN (
        SELECT ad_id, COUNT(*) as impression_count 
        FROM ad_impressions 
        GROUP BY ad_id
      ) ai ON la.id = ai.ad_id
      LEFT JOIN (
        SELECT ad_id, COUNT(*) as click_count 
        FROM ad_clicks 
        GROUP BY ad_id
      ) ac ON la.id = ac.ad_id
      ${whereClause}
      ORDER BY la.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM local_ads la ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      ads: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching local ads:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single ad with detailed analytics
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const adResult = await pool.query('SELECT * FROM local_ads WHERE id = $1', [id]);
    
    if (adResult.rows.length === 0) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    // Get detailed analytics
    const analyticsResult = await pool.query(`
      SELECT 
        COUNT(DISTINCT ai.id) as total_impressions,
        COUNT(DISTINCT ac.id) as total_clicks,
        COUNT(DISTINCT ai.user_id) as unique_viewers,
        COUNT(DISTINCT ac.user_id) as unique_clickers,
        COALESCE(AVG(CASE WHEN ac.id IS NOT NULL THEN 1.0 ELSE 0.0 END), 0) as ctr
      FROM ad_impressions ai
      LEFT JOIN ad_clicks ac ON ai.ad_id = ac.ad_id AND ai.user_id = ac.user_id
      WHERE ai.ad_id = $1
    `, [id]);
    
    // Get daily performance for last 30 days
    const dailyStatsResult = await pool.query(`
      SELECT 
        DATE(ai.created_at) as date,
        COUNT(ai.id) as impressions,
        COUNT(ac.id) as clicks
      FROM ad_impressions ai
      LEFT JOIN ad_clicks ac ON ai.ad_id = ac.ad_id AND DATE(ai.created_at) = DATE(ac.created_at)
      WHERE ai.ad_id = $1 AND ai.created_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(ai.created_at)
      ORDER BY date DESC
    `, [id]);
    
    res.json({
      ad: adResult.rows[0],
      analytics: analyticsResult.rows[0],
      daily_stats: dailyStatsResult.rows
    });
  } catch (error) {
    console.error('Error fetching ad details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new ad
router.post('/', adminAuth, async (req, res) => {
  try {
    const {
      advertiser_name, advertiser_email, advertiser_phone, ad_type, title,
      description, destination_url, display_duration_days, target_placement,
      payment_type, payment_amount, budget_limit, start_date, end_date,
      image_url, video_url
    } = req.body;
    
    if (!advertiser_name || !ad_type || !title || !payment_type || !payment_amount) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    let imageUrl = image_url;
    let videoUrl = video_url;
    
    const result = await pool.query(`
      INSERT INTO local_ads (
        advertiser_name, advertiser_email, advertiser_phone, ad_type, title,
        description, image_url, video_url, destination_url, display_duration_days,
        target_placement, payment_type, payment_amount, budget_limit, start_date, end_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `, [
      advertiser_name, advertiser_email, advertiser_phone, ad_type, title,
      description, imageUrl, videoUrl, destination_url, display_duration_days || 7,
      target_placement, payment_type, payment_amount, budget_limit,
      start_date || new Date(), end_date
    ]);
    
    res.status(201).json({
      message: 'Ad created successfully',
      ad: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating ad:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update ad
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      advertiser_name, advertiser_email, advertiser_phone, ad_type, title,
      description, destination_url, display_duration_days, target_placement,
      payment_type, payment_amount, budget_limit, start_date, end_date,
      status, is_active, image_url, video_url
    } = req.body;
    
    let imageUrl = image_url;
    let videoUrl = video_url;
    
    const result = await pool.query(`
      UPDATE local_ads SET
        advertiser_name = COALESCE($1, advertiser_name),
        advertiser_email = COALESCE($2, advertiser_email),
        advertiser_phone = COALESCE($3, advertiser_phone),
        ad_type = COALESCE($4, ad_type),
        title = COALESCE($5, title),
        description = COALESCE($6, description),
        image_url = COALESCE($7, image_url),
        video_url = COALESCE($8, video_url),
        destination_url = COALESCE($9, destination_url),
        display_duration_days = COALESCE($10, display_duration_days),
        target_placement = COALESCE($11, target_placement),
        payment_type = COALESCE($12, payment_type),
        payment_amount = COALESCE($13, payment_amount),
        budget_limit = COALESCE($14, budget_limit),
        start_date = COALESCE($15, start_date),
        end_date = COALESCE($16, end_date),
        status = COALESCE($17, status),
        is_active = COALESCE($18, is_active),
        updated_at = NOW()
      WHERE id = $19
      RETURNING *
    `, [
      advertiser_name, advertiser_email, advertiser_phone, ad_type, title,
      description, imageUrl, videoUrl, destination_url, display_duration_days,
      target_placement, payment_type, payment_amount, budget_limit,
      start_date, end_date, status, is_active, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    res.json({
      message: 'Ad updated successfully',
      ad: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating ad:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve/Reject ad
router.patch('/:id/review', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, review_notes } = req.body; // 'approved' or 'rejected'
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    const result = await pool.query(`
      UPDATE local_ads SET
        status = $1,
        is_active = $2,
        reviewed_by = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [status, status === 'approved', req.user?.id || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    res.json({
      message: `Ad ${status} successfully`,
      ad: result.rows[0]
    });
  } catch (error) {
    console.error('Error reviewing ad:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete ad
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM local_ads WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Ad not found' });
    }
    
    res.json({ message: 'Ad deleted successfully' });
  } catch (error) {
    console.error('Error deleting ad:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get ad statistics
router.get('/stats/overview', adminAuth, async (req, res) => {
  try {
    const adStats = await pool.query(`
      SELECT 
        COUNT(*) as total_ads,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_ads,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_ads,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_ads,
        SUM(CASE WHEN payment_type = 'flat' THEN payment_amount ELSE 0 END) as total_flat_revenue
      FROM local_ads
    `);
    
    const performanceStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT ai.id) as total_impressions,
        COUNT(DISTINCT ac.id) as total_clicks,
        COUNT(DISTINCT ai.user_id) as unique_viewers,
        CASE 
          WHEN COUNT(DISTINCT ai.id) > 0 
          THEN ROUND((COUNT(DISTINCT ac.id)::numeric / COUNT(DISTINCT ai.id) * 100), 2)
          ELSE 0 
        END as overall_ctr
      FROM ad_impressions ai
      LEFT JOIN ad_clicks ac ON ai.ad_id = ac.ad_id
    `);
    
    res.json({
      ads: adStats.rows[0],
      performance: performanceStats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching ad stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;