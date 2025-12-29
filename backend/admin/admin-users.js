/**
 * Admin Users Management API
 * Handles CRUD operations for admin users
 */

const express = require('express');
const pool = require('../config/database');
const bcrypt = require('bcrypt');
const { adminAuth, superadminOnly, checkPermission } = require('./auth');
const { activityLogger } = require('./middleware/activity-logger');

const router = express.Router();

// Get current admin user's permissions
router.get('/me/permissions', adminAuth, async (req, res) => {
  try {
    // If admin is already attached to the request by adminAuth middleware
    if (!req.admin) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    
    let permissions = [];
    
    // Check if user is a superadmin (either legacy or has superadmin role)
    if (req.admin.is_legacy || 
        (req.admin.role && 
         (req.admin.role.name === 'superadmin' || 
          req.admin.role.permissions?.all === true))) {
      // For superadmin, get all available permissions
      const permissionsResult = await pool.query(
        'SELECT name FROM admin_permissions'
      );
      
      permissions = permissionsResult.rows.map(p => p.name);
      // Add special 'all' permission for superadmins
      permissions.push('all');
    }
    else if (req.admin.role && req.admin.role.permissions) {
      // For normal admins, get their assigned permissions
      
      // First, check for direct permissions in the permissions JSONB
      const directPermissions = Object.keys(req.admin.role.permissions)
        .filter(key => req.admin.role.permissions[key] === true);
      
      permissions = permissions.concat(directPermissions);
      
      // Then, get permissions from the role_permissions junction table if it exists
      try {
        const rolePermissionsResult = await pool.query(`
          SELECT p.name 
          FROM admin_role_permissions rp
          JOIN admin_permissions p ON p.id = rp.permission_id
          WHERE rp.role_id = $1
        `, [req.admin.role.id]);
        
        const rolePermissions = rolePermissionsResult.rows.map(p => p.name);
        permissions = permissions.concat(rolePermissions);
      } catch (err) {
        // If the query fails (e.g., table doesn't exist), just continue with direct permissions
        console.warn('Failed to query role_permissions table:', err.message);
      }
    }
    
    // Remove duplicates
    permissions = [...new Set(permissions)];
    
    res.json({ permissions });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all admin users
router.get('/', adminAuth, checkPermission(['staff:view', 'staff:manage']), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        a.id, a.username, a.email, a.is_active, a.last_login, a.created_at,
        r.id as role_id, r.name as role_name
      FROM admin_users a
      JOIN admin_roles r ON a.role_id = r.id
      ORDER BY a.username ASC
    `);
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching admin users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single admin user by ID
router.get('/:id', adminAuth, checkPermission(['staff:view', 'staff:manage']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if viewing self (admin can always view their own profile)
    const isSelf = req.admin.id === parseInt(id);
    if (!isSelf && !req.admin.is_legacy && !req.admin.role.permissions.staff) {
      return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
    }
    
    const result = await pool.query(`
      SELECT 
        a.id, a.username, a.email, a.is_active, a.last_login, a.created_at,
        r.id as role_id, r.name as role_name, r.permissions as role_permissions
      FROM admin_users a
      JOIN admin_roles r ON a.role_id = r.id
      WHERE a.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Admin user not found' });
    }
    
    // Get recent activity logs
    const activityResult = await pool.query(`
      SELECT id, action, target_type, target_id, details, created_at
      FROM admin_activity_logs
      WHERE admin_user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `, [id]);
    
    res.json({
      user: result.rows[0],
      recentActivity: activityResult.rows
    });
  } catch (error) {
    console.error('Error fetching admin user details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new admin user
router.post('/', 
  adminAuth, 
  superadminOnly,
  activityLogger('create', 'admin_user', (req, data) => data.user?.id,
    (req) => ({ username: req.body.username, email: req.body.email, role_id: req.body.role_id })),
  async (req, res) => {
    try {
      const { username, email, password, role_id } = req.body;
      
      // Validate required fields
      if (!username || !password || !role_id) {
        return res.status(400).json({ message: 'Username, password, and role are required' });
      }
      
      // Check if username or email already exists
      const existingUser = await pool.query(
        'SELECT id FROM admin_users WHERE username = $1 OR (email = $2 AND email IS NOT NULL)',
        [username, email]
      );
      
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ message: 'Username or email already exists' });
      }
      
      // Validate role exists
      const roleCheck = await pool.query('SELECT id FROM admin_roles WHERE id = $1', [role_id]);
      if (roleCheck.rows.length === 0) {
        return res.status(400).json({ message: 'Invalid role ID' });
      }
      
      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      // Create new admin user
      const result = await pool.query(`
        INSERT INTO admin_users 
          (username, email, password_hash, role_id, is_active, created_at, updated_at, created_by)
        VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW(), $5)
        RETURNING id, username, email, is_active, created_at
      `, [username, email, hashedPassword, role_id, req.admin.id]);
      
      res.status(201).json({
        message: 'Admin user created successfully',
        user: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating admin user:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

// Update admin user
router.put('/:id', 
  adminAuth, 
  activityLogger('update', 'admin_user', 'id', 
    (req) => ({ 
      username: req.body.username,
      email: req.body.email, 
      role_id: req.body.role_id,
      is_active: req.body.is_active
    })),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { username, email, password, role_id, is_active } = req.body;
      
      // Check if user exists
      const userCheck = await pool.query(
        'SELECT username, role_id FROM admin_users WHERE id = $1',
        [id]
      );
      
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Admin user not found' });
      }
      
      // Check permissions
      const isSelf = req.admin.id === parseInt(id);
      const targetIsSuperadmin = await isSuperadminRole(userCheck.rows[0].role_id);
      
      // Only superadmins can edit superadmins
      if (targetIsSuperadmin && !isSuperAdmin(req.admin)) {
        return res.status(403).json({ message: 'Only superadmins can edit superadmin accounts' });
      }
      
      // For non-superadmins, they can only edit themselves and cannot change their role
      if (!isSuperAdmin(req.admin) && (!isSelf || role_id)) {
        return res.status(403).json({ message: 'Insufficient permissions to edit this admin user' });
      }
      
      // Start building the update query
      let query = `
        UPDATE admin_users
        SET updated_at = NOW()
      `;
      
      const params = [id];
      let paramIndex = 2;
      
      // Add fields to update only if provided
      if (username) {
        query += `, username = $${paramIndex++}`;
        params.push(username);
      }
      
      if (email) {
        query += `, email = $${paramIndex++}`;
        params.push(email);
      }
      
      // Only superadmin can change role
      if (role_id && isSuperAdmin(req.admin)) {
        // Verify role exists
        const roleCheck = await pool.query('SELECT id FROM admin_roles WHERE id = $1', [role_id]);
        if (roleCheck.rows.length === 0) {
          return res.status(400).json({ message: 'Invalid role ID' });
        }
        
        query += `, role_id = $${paramIndex++}`;
        params.push(role_id);
      }
      
      // Only superadmin can change active status (and can't deactivate themselves)
      if (is_active !== undefined && isSuperAdmin(req.admin) && !isSelf) {
        query += `, is_active = $${paramIndex++}`;
        params.push(is_active);
      }
      
      // Update password if provided
      if (password) {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        query += `, password_hash = $${paramIndex++}`;
        params.push(hashedPassword);
      }
      
      // Complete the query
      query += ` WHERE id = $1 RETURNING id, username, email, is_active, role_id, created_at, updated_at`;
      
      // Run the update query
      const result = await pool.query(query, params);
      
      // Get the role name for the response
      const roleResult = await pool.query(
        'SELECT name FROM admin_roles WHERE id = $1',
        [result.rows[0].role_id]
      );
      
      const updatedUser = {
        ...result.rows[0],
        role_name: roleResult.rows[0].name
      };
      
      res.json({
        message: 'Admin user updated successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Error updating admin user:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

// Delete admin user
router.delete('/:id', 
  adminAuth, 
  superadminOnly,
  activityLogger('delete', 'admin_user', 'id'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if user exists
      const userCheck = await pool.query(
        'SELECT username, role_id FROM admin_users WHERE id = $1',
        [id]
      );
      
      if (userCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Admin user not found' });
      }
      
      // Prevent deleting yourself
      if (req.admin.id === parseInt(id)) {
        return res.status(400).json({ message: 'Cannot delete your own account' });
      }
      
      // Check if user is a superadmin
      const targetIsSuperadmin = await isSuperadminRole(userCheck.rows[0].role_id);
      if (targetIsSuperadmin) {
        return res.status(403).json({ message: 'Cannot delete a superadmin account' });
      }
      
      // Delete the user
      await pool.query('DELETE FROM admin_users WHERE id = $1', [id]);
      
      res.json({ message: 'Admin user deleted successfully' });
    } catch (error) {
      console.error('Error deleting admin user:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

// Helper to check if a role ID is superadmin
async function isSuperadminRole(roleId) {
  try {
    const result = await pool.query(
      'SELECT name FROM admin_roles WHERE id = $1',
      [roleId]
    );
    
    return result.rows.length > 0 && result.rows[0].name === 'superadmin';
  } catch (error) {
    console.error('Error checking superadmin role:', error);
    return false;
  }
}

// Helper to check if admin is superadmin
function isSuperAdmin(admin) {
  return admin.is_legacy || admin.role.name === 'superadmin';
}

module.exports = router;