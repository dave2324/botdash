const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { adminAuth, checkPermission, superadminOnly } = require('./auth');

// Get admin activity logs with filtering and pagination
router.get('/activity-logs', adminAuth, checkPermission('view_activity_logs'), async (req, res) => {
  try {
    // Pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    // Filter parameters
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
    const action = req.query.action || null;
    const resourceType = req.query.resource_type || null;
    const startDate = req.query.start_date || null;
    const endDate = req.query.end_date || null;
    
    // Build query with filters
    let query = `
      SELECT 
        aal.id, 
        aal.admin_user_id as user_id,
        au.username,
        aal.action, 
        aal.target_type as resource_type, 
        aal.target_id as resource_id, 
        aal.details,
        aal.ip_address,
        aal.created_at
      FROM admin_activity_logs aal
      JOIN admin_users au ON au.id = aal.admin_user_id
      WHERE 1=1
    `;
    
    const queryParams = [];
    let paramIndex = 1;
    
    // Apply filters if provided
    if (userId) {
      query += ` AND aal.admin_user_id = $${paramIndex}`;
      queryParams.push(userId);
      paramIndex++;
    }
    
    if (action) {
      query += ` AND aal.action = $${paramIndex}`;
      queryParams.push(action);
      paramIndex++;
    }
    
    if (resourceType) {
      query += ` AND aal.target_type = $${paramIndex}`;
      queryParams.push(resourceType);
      paramIndex++;
    }
    
    if (startDate) {
      query += ` AND aal.created_at >= $${paramIndex}`;
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      query += ` AND aal.created_at <= $${paramIndex}`;
      queryParams.push(endDate);
      paramIndex++;
    }
    
    // Add sorting, pagination parameters
    query += ` ORDER BY aal.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    queryParams.push(limit, offset);
    
    // Execute query
    const result = await pool.query(query, queryParams);
    
    // Count total logs for pagination
    let countQuery = `
      SELECT COUNT(*) FROM admin_activity_logs aal
      WHERE 1=1
    `;
    
    // Apply same filters to count query
    let countParams = [];
    paramIndex = 1;
    
    if (userId) {
      countQuery += ` AND aal.admin_user_id = $${paramIndex}`;
      countParams.push(userId);
      paramIndex++;
    }
    
    if (action) {
      countQuery += ` AND aal.action = $${paramIndex}`;
      countParams.push(action);
      paramIndex++;
    }
    
    if (resourceType) {
      countQuery += ` AND aal.target_type = $${paramIndex}`;
      countParams.push(resourceType);
      paramIndex++;
    }
    
    if (startDate) {
      countQuery += ` AND aal.created_at >= $${paramIndex}`;
      countParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      countQuery += ` AND aal.created_at <= $${paramIndex}`;
      countParams.push(endDate);
      paramIndex++;
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);
    
    res.json({
      logs: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching admin activity logs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get activity log by ID
router.get('/activity-logs/:id', adminAuth, checkPermission('view_activity_logs'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        aal.id, 
        aal.admin_user_id as user_id,
        au.username,
        aal.action, 
        aal.target_type as resource_type, 
        aal.target_id as resource_id, 
        aal.details,
        aal.ip_address,
        aal.created_at
      FROM admin_activity_logs aal
      JOIN admin_users au ON au.id = aal.admin_user_id
      WHERE aal.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Activity log not found' });
    }
    
    res.json({ log: result.rows[0] });
  } catch (error) {
    console.error('Error fetching activity log:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a utility function for logging admin activities
// This can be imported and used in other parts of the admin API
const logAdminActivity = async (adminUserId, action, targetType, targetId, details, ipAddress) => {
  try {
    const result = await pool.query(`
      INSERT INTO admin_activity_logs
        (admin_user_id, action, target_type, target_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [
      adminUserId, 
      action, 
      targetType, 
      targetId, 
      details, 
      ipAddress
    ]);
    
    return result.rows[0].id;
  } catch (error) {
    console.error('Error logging admin activity:', error);
    // Don't throw error, just log it to avoid disrupting the main flow
    return null;
  }
};

module.exports = {
  router,
  logAdminActivity
};