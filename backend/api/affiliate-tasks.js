const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const optionalAuth = require('../middleware/optional-auth');
const path = require('path');
const fs = require('fs');

const router = express.Router();


// Get available affiliate tasks for user
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { type, category, page = 1, limit = 10 } = req.query;
    const userId = req.telegramUser?.id;
    
    // If no user ID, still return tasks but without user-specific filtering
    const userSpecificFiltering = !!userId;
    const offset = (page - 1) * limit;
    
    let isPremium = false;
    
    // Check user premium status only if user is authenticated
    if (userSpecificFiltering) {
      const userResult = await pool.query(
        'SELECT is_premium, premium_until FROM telegram_users WHERE id = $1',
        [userId]
      );
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        isPremium = user.is_premium && new Date(user.premium_until) > new Date();
      }
    }
    
    let whereClause = `
      WHERE at.is_active = true 
      AND (at.expiry_date IS NULL OR at.expiry_date > NOW())
      AND (at.completion_limit IS NULL OR (
        SELECT COUNT(*) FROM affiliate_task_attempts
        WHERE task_id = at.id AND status IN ('approved', 'completed')
      ) < at.completion_limit)
    `;
    
    let queryParams = [];
    let paramCount = 0;
    
    // Add user-specific filtering only if user is authenticated
    if (userSpecificFiltering) {
      whereClause += ` AND NOT EXISTS (
        SELECT 1 FROM affiliate_task_attempts ata
        WHERE ata.task_id = at.id AND ata.user_id = $1
        AND ata.status IN ('approved', 'completed', 'rejected')
      )`;
      queryParams.push(userId);
      paramCount = 1;
    }
    
    // Filter by premium requirement
    if (!isPremium) {
      whereClause += ' AND at.require_premium = false';
    }
    
    if (type) {
      paramCount++;
      whereClause += ` AND at.affiliate_type = $${paramCount}`;
      queryParams.push(type);
    }
    
    const result = await pool.query(`
      SELECT 
        at.*,
        (SELECT COUNT(*) FROM affiliate_task_attempts WHERE task_id = at.id AND status IN ('approved', 'completed')) as completion_count
      FROM affiliate_tasks at
      ${whereClause}
      ORDER BY at.reward_amount DESC, at.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM affiliate_tasks at ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      tasks: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      user_premium: isPremium
    });
  } catch (error) {
    console.error('Error fetching affiliate tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single affiliate task details
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    const taskResult = await pool.query(`
      SELECT at.*,
             (SELECT COUNT(*) FROM affiliate_task_attempts WHERE task_id = at.id AND status IN ('approved', 'completed')) as completion_count
      FROM affiliate_tasks at
      WHERE at.id = $1 AND at.is_active = true
    `, [id]);
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found or inactive' });
    }
    
    // Check if user already attempted this task
    const attemptResult = await pool.query(
      'SELECT * FROM affiliate_task_attempts WHERE task_id = $1 AND user_id = $2',
      [id, userId]
    );
    
    res.json({
      task: taskResult.rows[0],
      user_attempt: attemptResult.rows[0] || null
    });
  } catch (error) {
    console.error('Error fetching affiliate task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Start affiliate task (record click/start)
router.post('/:id/start', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { ip_address, device_id } = req.body;
    
    // Check if task exists and is active
    const taskResult = await pool.query(`
      SELECT * FROM affiliate_tasks 
      WHERE id = $1 AND is_active = true 
      AND (expiry_date IS NULL OR expiry_date > NOW())
    `, [id]);
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found or inactive' });
    }
    
    const task = taskResult.rows[0];
    
    // Check if user already attempted
    const existingAttempt = await pool.query(
      'SELECT * FROM affiliate_task_attempts WHERE task_id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (existingAttempt.rows.length > 0) {
      return res.status(400).json({ message: 'You have already attempted this task' });
    }
    
    // Check completion limit
    if (task.completion_limit) {
      const completionCount = await pool.query(
        'SELECT COUNT(*) FROM affiliate_task_attempts WHERE task_id = $1 AND status IN (\'approved\', \'completed\')',
        [id]
      );
      
      if (parseInt(completionCount.rows[0].count) >= task.completion_limit) {
        return res.status(400).json({ message: 'Task has reached completion limit' });
      }
    }
    
    // Create attempt record
    const attemptResult = await pool.query(`
      INSERT INTO affiliate_task_attempts (
        user_id, task_id, ip_address, device_id, status
      ) VALUES ($1, $2, $3, $4, 'started')
      RETURNING *
    `, [userId, id, ip_address, device_id]);
    
    res.json({
      message: 'Task started successfully',
      attempt: attemptResult.rows[0],
      affiliate_link: task.affiliate_link
    });
  } catch (error) {
    console.error('Error starting affiliate task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit proof for affiliate task with Supabase URL
router.post('/:id/submit-proof', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { proof_text, proof_file_url } = req.body;
    
    // Get user's attempt
    const attemptResult = await pool.query(
      'SELECT * FROM affiliate_task_attempts WHERE task_id = $1 AND user_id = $2',
      [id, userId]
    );
    
    if (attemptResult.rows.length === 0) {
      return res.status(404).json({ message: 'No attempt found for this task' });
    }
    
    const attempt = attemptResult.rows[0];
    
    if (attempt.status !== 'started') {
      return res.status(400).json({ message: 'Cannot submit proof for this attempt' });
    }
    
    let proofUrl = proof_file_url || null;
    
    // Update attempt with proof and change status to pending
    const updateResult = await pool.query(`
      UPDATE affiliate_task_attempts SET
        proof_url = $1,
        proof_text = $2,
        status = 'pending',
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [proofUrl, proof_text, attempt.id]);
    
    res.json({
      message: 'Proof submitted successfully. Awaiting admin review.',
      attempt: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Error submitting proof:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's affiliate task attempts
router.get('/my/attempts', auth, async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE ata.user_id = $1';
    let queryParams = [userId];
    let paramCount = 1;
    
    if (status) {
      // Handle both 'approved' and 'completed' for backward compatibility
      if (status === 'approved' || status === 'completed') {
        whereClause += ` AND ata.status IN ('approved', 'completed')`;
      } else {
        paramCount++;
        whereClause += ` AND ata.status = $${paramCount}`;
        queryParams.push(status);
      }
    }
    
    const result = await pool.query(`
      SELECT 
        ata.*,
        at.title,
        at.affiliate_type,
        at.reward_type,
        at.reward_amount
      FROM affiliate_task_attempts ata
      JOIN affiliate_tasks at ON ata.task_id = at.id
      ${whereClause}
      ORDER BY ata.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM affiliate_task_attempts ata ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    
    // Get stats
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN status IN ('approved', 'completed') THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN status = 'started' THEN 1 END) as started,
        COALESCE(SUM(points_awarded), 0) as total_points_earned
      FROM affiliate_task_attempts
      WHERE user_id = $1
    `, [userId]);
    
    res.json({
      attempts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching user attempts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get affiliate task categories/types
router.get('/meta/categories', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        affiliate_type,
        COUNT(*) as count,
        AVG(reward_amount) as avg_reward
      FROM affiliate_tasks 
      WHERE is_active = true
      GROUP BY affiliate_type
      ORDER BY affiliate_type
    `);
    
    res.json({
      categories: result.rows
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;