/**
 * Admin Roles Management API
 * Handles CRUD operations for admin roles
 */

const express = require('express');
const pool = require('../config/database');
const { adminAuth, superadminOnly, checkPermission } = require('./auth');
const { activityLogger } = require('./middleware/activity-logger');

const router = express.Router();

// Default permissions structure to help UI rendering
const DEFAULT_PERMISSION_CATEGORIES = {
  dashboard: { label: 'Dashboard', description: 'Access to dashboard statistics' },
  users: { label: 'Users', description: 'User management' },
  tasks: { label: 'Tasks', description: 'Task management' },
  transactions: { label: 'Transactions', description: 'Financial transactions' },
  moderate: { label: 'Moderation', description: 'Content moderation' },
  settings: { label: 'Settings', description: 'System settings' },
  roles: { label: 'Roles', description: 'Role management' },
  staff: { label: 'Staff', description: 'Staff management' }
};

const DEFAULT_PERMISSIONS = {
  'dashboard:view': { label: 'View Dashboard', category: 'dashboard' },
  'users:view': { label: 'View Users', category: 'users' },
  'users:edit': { label: 'Edit Users', category: 'users' },
  'users:ban': { label: 'Ban/Unban Users', category: 'users' },
  'tasks:view': { label: 'View Tasks', category: 'tasks' },
  'tasks:create': { label: 'Create Tasks', category: 'tasks' },
  'tasks:edit': { label: 'Edit Tasks', category: 'tasks' },
  'tasks:delete': { label: 'Delete Tasks', category: 'tasks' },
  'tasks:moderate': { label: 'Moderate Tasks', category: 'tasks' },
  'transactions:view': { label: 'View Transactions', category: 'transactions' },
  'transactions:process': { label: 'Process Transactions', category: 'transactions' },
  'transactions:adjust': { label: 'Adjust User Balance', category: 'transactions' },
  'moderate:approve': { label: 'Approve Content', category: 'moderate' },
  'moderate:reject': { label: 'Reject Content', category: 'moderate' },
  'settings:view': { label: 'View Settings', category: 'settings' },
  'settings:edit': { label: 'Edit Settings', category: 'settings' },
  'roles:view': { label: 'View Roles', category: 'roles' },
  'roles:manage': { label: 'Manage Roles', category: 'roles' },
  'staff:view': { label: 'View Staff', category: 'staff' },
  'staff:manage': { label: 'Manage Staff', category: 'staff' }
};

// Get all permissions - simplified endpoint for frontend
router.get('/permissions', adminAuth, checkPermission('roles:view'), async (req, res) => {
  try {
    // Convert DEFAULT_PERMISSIONS to array format expected by frontend
    const permissions = Object.entries(DEFAULT_PERMISSIONS).map(([name, config], index) => ({
      id: index + 1,
      name: name,
      description: config.label
    }));

    res.json({ permissions });
  } catch (error) {
    console.error('Error fetching permissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get permission metadata - helps frontend to render permission UI
router.get('/permissions/meta', adminAuth, checkPermission('roles:view'), async (req, res) => {
  try {
    res.json({
      categories: DEFAULT_PERMISSION_CATEGORIES,
      permissions: DEFAULT_PERMISSIONS
    });
  } catch (error) {
    console.error('Error fetching permission metadata:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all roles
router.get('/', adminAuth, checkPermission('roles:view'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, name, description, permissions, is_active, created_at, updated_at
      FROM admin_roles
      ORDER BY name ASC
    `);
    
    res.json({ roles: result.rows });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single role by ID
router.get('/:id', adminAuth, checkPermission('roles:view'), async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT id, name, description, permissions, is_active, created_at, updated_at
      FROM admin_roles
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Role not found' });
    }
    
    // Get all admins using this role
    const adminUsersResult = await pool.query(`
      SELECT id, username, email, is_active, last_login, created_at
      FROM admin_users
      WHERE role_id = $1
      ORDER BY username ASC
    `, [id]);
    
    res.json({
      role: result.rows[0],
      users: adminUsersResult.rows
    });
  } catch (error) {
    console.error('Error fetching role details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new role
router.post('/', 
  adminAuth, 
  superadminOnly,
  activityLogger('create', 'role', (req, data) => data.role?.id, (req) => ({ name: req.body.name })),
  async (req, res) => {
    try {
      const { name, description, permissions } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: 'Role name is required' });
      }
      
      // Check if role name already exists
      const existingRole = await pool.query(
        'SELECT id FROM admin_roles WHERE name = $1',
        [name]
      );
      
      if (existingRole.rows.length > 0) {
        return res.status(400).json({ message: 'Role name already exists' });
      }
      
      // Create new role
      const result = await pool.query(`
        INSERT INTO admin_roles (name, description, permissions, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, TRUE, NOW(), NOW())
        RETURNING *
      `, [name, description || null, permissions || {}]);
      
      res.status(201).json({ 
        message: 'Role created successfully',
        role: result.rows[0]
      });
    } catch (error) {
      console.error('Error creating role:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

// Update role
router.put('/:id', 
  adminAuth, 
  superadminOnly,
  activityLogger('update', 'role', 'id', (req) => ({ name: req.body.name })),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, permissions, is_active } = req.body;
      
      // Prevent modifying the superadmin role
      const roleCheck = await pool.query(
        'SELECT name FROM admin_roles WHERE id = $1',
        [id]
      );
      
      if (roleCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Role not found' });
      }
      
      if (roleCheck.rows[0].name === 'superadmin') {
        return res.status(403).json({ message: 'Cannot modify the superadmin role' });
      }
      
      // Update the role
      const result = await pool.query(`
        UPDATE admin_roles
        SET 
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          permissions = COALESCE($3, permissions),
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `, [name, description, permissions, is_active, id]);
      
      res.json({ 
        message: 'Role updated successfully',
        role: result.rows[0]
      });
    } catch (error) {
      console.error('Error updating role:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

// Delete role
router.delete('/:id', 
  adminAuth, 
  superadminOnly,
  activityLogger('delete', 'role', 'id'),
  async (req, res) => {
    try {
      const { id } = req.params;
      
      // Check if role exists
      const roleCheck = await pool.query(
        'SELECT name FROM admin_roles WHERE id = $1',
        [id]
      );
      
      if (roleCheck.rows.length === 0) {
        return res.status(404).json({ message: 'Role not found' });
      }
      
      // Prevent deleting built-in roles
      if (['superadmin', 'admin', 'staff'].includes(roleCheck.rows[0].name)) {
        return res.status(403).json({ message: 'Cannot delete a built-in role' });
      }
      
      // Check if role is in use
      const usageCheck = await pool.query(
        'SELECT COUNT(*) FROM admin_users WHERE role_id = $1',
        [id]
      );
      
      if (parseInt(usageCheck.rows[0].count) > 0) {
        return res.status(400).json({ message: 'Role is assigned to users and cannot be deleted' });
      }
      
      // Delete the role
      await pool.query('DELETE FROM admin_roles WHERE id = $1', [id]);
      
      res.json({ message: 'Role deleted successfully' });
    } catch (error) {
      console.error('Error deleting role:', error);
      res.status(500).json({ message: 'Server error' });
    }
});

module.exports = router;