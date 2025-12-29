const express = require('express');
const pool = require('../config/database');
const { adminAuth } = require('./auth');
const { activityLogger } = require('./middleware/activity-logger');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Get all affiliate tasks
router.get('/', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, type, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;
    
    if (type) {
      paramCount++;
      whereClause += ` AND affiliate_type = $${paramCount}`;
      queryParams.push(type);
    }
    
    if (status !== undefined) {
      paramCount++;
      whereClause += ` AND is_active = $${paramCount}`;
      queryParams.push(status === 'active');
    }
    
    const result = await pool.query(`
      SELECT 
        at.*,
        COUNT(ata.id) as total_attempts,
        COUNT(CASE WHEN ata.status IN ('approved', 'completed') THEN 1 END) as completed_attempts,
        COUNT(CASE WHEN ata.status = 'pending' THEN 1 END) as pending_attempts,
        COUNT(CASE WHEN ata.status IN ('approved', 'completed') THEN 1 END) as current_completions,
        CASE 
          WHEN at.expiry_date IS NOT NULL AND at.expiry_date <= NOW() THEN 'expired'
          WHEN at.is_active = true THEN 'active'
          ELSE 'inactive'
        END as status,
        at.affiliate_type as type,
        at.affiliate_link as target_link,
        at.completion_limit as max_completions,
        at.expiry_date as expires_at
      FROM affiliate_tasks at
      LEFT JOIN affiliate_task_attempts ata ON at.id = ata.task_id
      ${whereClause}
      GROUP BY at.id
      ORDER BY at.created_at DESC
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
      }
    });
  } catch (error) {
    console.error('Error fetching affiliate tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Redirect /stats to /stats/overview for backward compatibility
router.get('/stats', adminAuth, (req, res) => {
  res.redirect('/admin/affiliate-tasks/stats/overview');
});

// Get affiliate task statistics
router.get('/stats/overview', adminAuth, async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_tasks,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_tasks,
        COUNT(CASE WHEN affiliate_type = 'CPL' THEN 1 END) as cpl_tasks,
        COUNT(CASE WHEN affiliate_type = 'CPA' THEN 1 END) as cpa_tasks
      FROM affiliate_tasks
    `);
    
    const attemptStats = await pool.query(`
      SELECT 
        COUNT(*) as total_attempts,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_attempts,
        COUNT(CASE WHEN status IN ('approved', 'completed') THEN 1 END) as completed_attempts,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_attempts,
        COALESCE(SUM(points_awarded), 0) as total_points_awarded
      FROM affiliate_task_attempts
    `);
    
    // Combine and format stats for frontend compatibility
    const taskStats = stats.rows[0];
    const attemptStatsData = attemptStats.rows[0];
    
    res.json({
      tasks: taskStats,
      attempts: attemptStatsData,
      stats: {
        totalTasks: parseInt(taskStats.total_tasks),
        activeTasks: parseInt(taskStats.active_tasks),
        totalCompletions: parseInt(attemptStatsData.completed_attempts),
        totalRewardsPaid: parseFloat(attemptStatsData.total_points_awarded) || 0
      }
    });
  } catch (error) {
    console.error('Error fetching affiliate stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all pending attempts (needs to be before /:id route)
router.get('/attempts', adminAuth, async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;

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
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url,
        at.title as task_title,
        at.reward_amount,
        at.reward_type
      FROM affiliate_task_attempts ata
      LEFT JOIN telegram_users tu ON ata.user_id = tu.id
      LEFT JOIN affiliate_tasks at ON ata.task_id = at.id
      ${whereClause}
      ORDER BY ata.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM affiliate_task_attempts ata ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      attempts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching task attempts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single affiliate task
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const taskResult = await pool.query(`
      SELECT at.*, 
             COUNT(ata.id) as total_attempts,
             COUNT(CASE WHEN ata.status IN ('approved', 'completed') THEN 1 END) as completed_attempts,
             COUNT(CASE WHEN ata.status IN ('approved', 'completed') THEN 1 END) as current_completions,
             CASE 
               WHEN at.expiry_date IS NOT NULL AND at.expiry_date <= NOW() THEN 'expired'
               WHEN at.is_active = true THEN 'active'
               ELSE 'inactive'
             END as status,
             at.affiliate_type as type,
             at.affiliate_link as target_link,
             at.completion_limit as max_completions,
             at.expiry_date as expires_at
      FROM affiliate_tasks at
      LEFT JOIN affiliate_task_attempts ata ON at.id = ata.task_id
      WHERE at.id = $1
      GROUP BY at.id
    `, [id]);
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Affiliate task not found' });
    }
    
    // Get recent attempts
    const attemptsResult = await pool.query(`
      SELECT 
        ata.*,
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url
      FROM affiliate_task_attempts ata
      LEFT JOIN telegram_users tu ON ata.user_id = tu.id
      WHERE ata.task_id = $1
      ORDER BY ata.created_at DESC
      LIMIT 20
    `, [id]);
    
    res.json({
      task: taskResult.rows[0],
      attempts: attemptsResult.rows
    });
  } catch (error) {
    console.error('Error fetching affiliate task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new affiliate task
router.post('/',
  adminAuth,
  activityLogger('create', 'affiliate_task', (req, data) => data.task?.id, (req) => ({
    title: req.body.title,
    type: req.body.type,
    reward: req.body.reward
  })),
  async (req, res) => {
  try {
    // Support both old and new field names for backward compatibility
    const {
      title, 
      description, 
      affiliate_type, 
      type, // Alternative field name
      affiliate_link, 
      target_link, // Alternative field name
      instructions,
      target_country, 
      verification_method, 
      reward_type, 
      reward_amount,
      completion_limit, 
      max_completions, // Alternative field name
      per_user_limit, 
      expiry_date, 
      expires_at, // Alternative field name
      proof_requirement, 
      require_premium,
      status // Accept but ignore status in creation
    } = req.body;
    
    // Normalize field names (support alternative names)
    const normalizedData = {
      title: title,
      description: description,
      affiliate_type: affiliate_type || type,
      affiliate_link: affiliate_link || target_link,
      instructions: instructions,
      target_country: target_country,
      verification_method: verification_method,
      reward_type: reward_type || 'points', // Default to points if not specified
      reward_amount: reward_amount,
      completion_limit: completion_limit || max_completions,
      per_user_limit: per_user_limit || 1,
      expiry_date: expiry_date || expires_at || null,
      proof_requirement: proof_requirement,
      require_premium: require_premium || false
    };
    
    // Validate required fields with normalized names
    if (!normalizedData.title || !normalizedData.affiliate_type || !normalizedData.affiliate_link || 
        !normalizedData.verification_method || !normalizedData.reward_amount) {
      return res.status(400).json({ 
        message: 'Missing required fields',
        required: ['title', 'affiliate_type (or type)', 'affiliate_link (or target_link)', 'verification_method', 'reward_amount'],
        received: Object.keys(req.body)
      });
    }
    
    // Convert empty strings to null for optional fields
    if (normalizedData.expiry_date === '') normalizedData.expiry_date = null;
    if (normalizedData.target_country === '') normalizedData.target_country = null;
    if (normalizedData.instructions === '') normalizedData.instructions = null;
    if (normalizedData.proof_requirement === '') normalizedData.proof_requirement = null;
    
    const result = await pool.query(`
      INSERT INTO affiliate_tasks (
        title, description, affiliate_type, affiliate_link, instructions,
        target_country, verification_method, reward_type, reward_amount,
        completion_limit, per_user_limit, expiry_date, proof_requirement, require_premium
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *
    `, [
      normalizedData.title, 
      normalizedData.description, 
      normalizedData.affiliate_type, 
      normalizedData.affiliate_link, 
      normalizedData.instructions,
      normalizedData.target_country, 
      normalizedData.verification_method, 
      normalizedData.reward_type, 
      normalizedData.reward_amount,
      normalizedData.completion_limit, 
      normalizedData.per_user_limit, 
      normalizedData.expiry_date, 
      normalizedData.proof_requirement, 
      normalizedData.require_premium
    ]);
    
    res.status(201).json({
      message: 'Affiliate task created successfully',
      task: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating affiliate task:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update affiliate task
router.put('/:id',
  adminAuth,
  activityLogger('update', 'affiliate_task', 'id', (req) => ({
    title: req.body.title,
    type: req.body.type || req.body.affiliate_type,
    changes: Object.keys(req.body)
  })),
  async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title, description, affiliate_type, affiliate_link, instructions,
      target_country, verification_method, reward_type, reward_amount,
      completion_limit, per_user_limit, expiry_date, proof_requirement, 
      require_premium, is_active, status,
      // Frontend compatibility fields
      type, target_link, max_completions, expires_at
    } = req.body;
    
    // Convert frontend field names to backend field names
    const normalizedData = {
      title: title,
      description: description,
      affiliate_type: affiliate_type || type,
      affiliate_link: affiliate_link || target_link,
      instructions: instructions,
      target_country: target_country,
      verification_method: verification_method,
      reward_type: reward_type,
      reward_amount: reward_amount,
      completion_limit: completion_limit || max_completions,
      per_user_limit: per_user_limit,
      expiry_date: expiry_date || expires_at,
      proof_requirement: proof_requirement,
      require_premium: require_premium,
      is_active: is_active !== undefined ? is_active : (status === 'active')
    };
    
    const result = await pool.query(`
      UPDATE affiliate_tasks SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        affiliate_type = COALESCE($3, affiliate_type),
        affiliate_link = COALESCE($4, affiliate_link),
        instructions = COALESCE($5, instructions),
        target_country = COALESCE($6, target_country),
        verification_method = COALESCE($7, verification_method),
        reward_type = COALESCE($8, reward_type),
        reward_amount = COALESCE($9, reward_amount),
        completion_limit = COALESCE($10, completion_limit),
        per_user_limit = COALESCE($11, per_user_limit),
        expiry_date = COALESCE($12, expiry_date),
        proof_requirement = COALESCE($13, proof_requirement),
        require_premium = COALESCE($14, require_premium),
        is_active = COALESCE($15, is_active),
        updated_at = NOW()
      WHERE id = $16
      RETURNING *,
        CASE 
          WHEN expiry_date IS NOT NULL AND expiry_date <= NOW() THEN 'expired'
          WHEN is_active = true THEN 'active'
          ELSE 'inactive'
        END as status,
        affiliate_type as type,
        affiliate_link as target_link,
        completion_limit as max_completions,
        expiry_date as expires_at
    `, [
      normalizedData.title, normalizedData.description, normalizedData.affiliate_type, 
      normalizedData.affiliate_link, normalizedData.instructions, normalizedData.target_country, 
      normalizedData.verification_method, normalizedData.reward_type, normalizedData.reward_amount,
      normalizedData.completion_limit, normalizedData.per_user_limit, normalizedData.expiry_date, 
      normalizedData.proof_requirement, normalizedData.require_premium, normalizedData.is_active, id
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Affiliate task not found' });
    }
    
    res.json({
      message: 'Affiliate task updated successfully',
      task: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating affiliate task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete affiliate task
router.delete('/:id',
  adminAuth,
  activityLogger('delete', 'affiliate_task', 'id'),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query('DELETE FROM affiliate_tasks WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Affiliate task not found' });
    }
    
    res.json({ message: 'Affiliate task deleted successfully' });
  } catch (error) {
    console.error('Error deleting affiliate task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get task attempts for review
router.get('/:id/attempts', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE ata.task_id = $1';
    let queryParams = [id];
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
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url,
        at.title as task_title
      FROM affiliate_task_attempts ata
      LEFT JOIN telegram_users tu ON ata.user_id = tu.id
      LEFT JOIN affiliate_tasks at ON ata.task_id = at.id
      ${whereClause}
      ORDER BY ata.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM affiliate_task_attempts ata ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      attempts: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching task attempts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Approve/Reject task attempt
router.patch('/attempts/:attemptId',
  adminAuth,
  activityLogger('moderate', 'task_attempt', 'attemptId', (req) => ({
    status: req.body.status,
    admin_notes: req.body.admin_notes,
    action: req.body.status === 'approved' ? 'approved' : 'rejected'
  })),
  async (req, res) => {
  const client = await pool.connect();
  try {
    const { attemptId } = req.params;
    const { status, admin_notes } = req.body; // 'approved' or 'rejected'
    
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be approved or rejected' });
    }
    
    await client.query('BEGIN');
    
    // Get attempt details
    const attemptResult = await client.query(`
      SELECT ata.*, at.reward_amount, at.reward_type, at.title
      FROM affiliate_task_attempts ata
      JOIN affiliate_tasks at ON ata.task_id = at.id
      WHERE ata.id = $1 AND ata.status = 'pending'
    `, [attemptId]);
    
    if (attemptResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Pending attempt not found' });
    }
    
    const attempt = attemptResult.rows[0];
    let pointsAwarded = 0;
    let cashAwarded = 0;
    
    if (status === 'approved') {
      if (attempt.reward_type === 'points') {
        pointsAwarded = parseInt(attempt.reward_amount);
        // Add points to user
        await client.query('SELECT add_points_to_user($1, $2)', [attempt.user_id, pointsAwarded]);
      } else if (attempt.reward_type === 'cash') {
        cashAwarded = parseFloat(attempt.reward_amount);
        // Add cash to user balance (you'll need to implement this)
      }
      
      // Log transaction
      await client.query(`
        INSERT INTO enhanced_transaction_logs (
          user_id, transaction_type, amount, balance_before, balance_after,
          description, reference_type, reference_id
        )
        SELECT 
          $1::bigint, 'affiliate_reward', $2::decimal, 
          (SELECT points FROM telegram_users WHERE id = $1::bigint) - $2::decimal,
          (SELECT points FROM telegram_users WHERE id = $1::bigint),
          $3, 'affiliate_task', $4::integer
      `, [attempt.user_id, pointsAwarded, `Affiliate task reward: ${attempt.title}`, attempt.task_id]);
    }
    
    // Update attempt
    await client.query(`
      UPDATE affiliate_task_attempts SET
        status = $1,
        admin_notes = $2,
        points_awarded = $3,
        cash_awarded = $4,
        completed_at = $5,
        updated_at = NOW()
      WHERE id = $6
    `, [
      status,
      admin_notes,
      pointsAwarded,
      cashAwarded,
      status === 'approved' ? new Date() : null,
      attemptId
    ]);
    
    await client.query('COMMIT');
    
    res.json({
      message: `Attempt ${status} successfully`,
      points_awarded: pointsAwarded,
      cash_awarded: cashAwarded
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing attempt:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;