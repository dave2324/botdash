const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { adminAuth } = require('./auth');

// Get all promotion submissions with user information and filtering
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status, platform, search, limit = 100, offset = 0 } = req.query;
    
    let query = `
      SELECT 
        ps.*,
        u.username,
        u.first_name,
        u.last_name,
        u.photo_url,
        u.points,
        pp.name as product_name
      FROM promotion_submissions ps
      LEFT JOIN telegram_users u ON ps.user_id::bigint = u.id
      LEFT JOIN promotion_products pp ON ps.product_id = pp.id
    `;
    
    const conditions = [];
    const values = [];
    let paramCount = 0;
    
    // Add status filter
    if (status && status !== 'all') {
      paramCount++;
      conditions.push(`ps.status = $${paramCount}`);
      values.push(status);
    }
    
    // Add platform filter
    if (platform && platform !== 'all') {
      paramCount++;
      conditions.push(`LOWER(ps.platform) = LOWER($${paramCount})`);
      values.push(platform);
    }
    
    // Add search filter
    if (search) {
      paramCount++;
      conditions.push(`(
        LOWER(u.username) LIKE LOWER($${paramCount}) OR
        LOWER(u.first_name) LIKE LOWER($${paramCount}) OR
        LOWER(u.last_name) LIKE LOWER($${paramCount}) OR
        LOWER(pp.name) LIKE LOWER($${paramCount}) OR
        ps.user_id::text LIKE $${paramCount}
      )`);
      values.push(`%${search}%`);
    }
    
    // Add WHERE clause if there are conditions
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    // Add ordering and pagination
    query += ' ORDER BY ps.created_at DESC';
    
    if (limit) {
      paramCount++;
      query += ` LIMIT $${paramCount}`;
      values.push(parseInt(limit));
    }
    
    if (offset) {
      paramCount++;
      query += ` OFFSET $${paramCount}`;
      values.push(parseInt(offset));
    }
    
    const result = await pool.query(query, values);
    
    // Get total count for pagination info
    let countQuery = `
      SELECT COUNT(*) as total
      FROM promotion_submissions ps
      LEFT JOIN telegram_users u ON ps.user_id::bigint = u.id
      LEFT JOIN promotion_products pp ON ps.product_id = pp.id
    `;
    
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    
    const countResult = await pool.query(countQuery, values.slice(0, values.length - (limit ? 1 : 0) - (offset ? 1 : 0)));
    
    res.json({
      submissions: result.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: result.rows.length === parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching promotion submissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a promotion submission (approve/reject)
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, reward_amount } = req.body;
    
    // Update the submission
    await pool.query(
      'UPDATE promotion_submissions SET status = $1, admin_notes = $2, points_awarded = $3, reviewed_at = NOW(), reviewed_by = $4 WHERE id = $5',
      [status, notes, reward_amount, req.admin.id, id]
    );
    
    // Return the updated submission with user information
    const result = await pool.query(`
      SELECT 
        ps.*,
        u.username,
        u.first_name,
        u.last_name,
        u.photo_url,
        u.points,
        pp.name as product_name
      FROM promotion_submissions ps
      LEFT JOIN telegram_users u ON ps.user_id::bigint = u.id
      LEFT JOIN promotion_products pp ON ps.product_id = pp.id
      WHERE ps.id = $1
    `, [id]);
    
    // If approved, award points to user
    if (status === 'approved' && reward_amount > 0) {
      await pool.query(
        'UPDATE telegram_users SET points = points + $1 WHERE id = $2',
        [reward_amount, result.rows[0].user_id]
      );
    }
    
    res.json({ submission: result.rows[0] });
  } catch (error) {
    console.error('Error updating promotion submission:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
