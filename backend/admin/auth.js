const jwt = require('jsonwebtoken');
const pool = require('../config/database');

// Import activity logger
let logAdminActivity;
try {
  // Handle circular dependency by importing lazily
  logAdminActivity = require('./activity-logs').logAdminActivity;
} catch (err) {
  // If activity-logs module is not available yet, use a dummy function that returns a resolved promise
  logAdminActivity = () => Promise.resolve();
}

/**
 * Base admin authentication middleware - verifies JWT token
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
const adminAuth = async (req, res, next) => {
  try {
    // Get token from header - support both formats
    let token = req.header('x-admin-token');

    // Also check Authorization header with Bearer format
    if (!token) {
      const authHeader = req.header('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7); // Remove 'Bearer ' prefix
      }
    }

    // Check if token exists
    if (!token) {
      return res.status(401).json({ message: 'Access denied. No token provided.' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

    // Legacy support for environment variable based admin accounts
    if (decoded.username === process.env.ADMIN_USERNAME) {
      // Legacy superadmin from environment variables
      req.admin = {
        id: 0, // Special ID for legacy admin
        username: decoded.username,
        role: {
          name: 'superadmin',
          permissions: { all: true }
        },
        is_legacy: true
      };
      return next();
    }
    
    // For database users, fetch admin details including role and permissions
    const adminResult = await pool.query(`
      SELECT 
        a.id, a.username, a.email, a.is_active,
        r.id as role_id, r.name as role_name, r.permissions
      FROM admin_users a
      JOIN admin_roles r ON a.role_id = r.id
      WHERE a.username = $1 AND a.is_active = TRUE
    `, [decoded.username]);
    
    if (adminResult.rows.length === 0) {
      return res.status(403).json({ message: 'Access denied. Admin account inactive or not found.' });
    }
    
    const admin = adminResult.rows[0];
    
    // Attach admin info to request object
    req.admin = {
      id: admin.id,
      username: admin.username,
      email: admin.email,
      role: {
        id: admin.role_id,
        name: admin.role_name,
        permissions: admin.permissions || {}
      }
    };
    
    // Log the access time
    await pool.query(`
      UPDATE admin_users 
      SET last_login = NOW() 
      WHERE id = $1
    `, [admin.id]);
    
    // Log admin login activity (if logAdminActivity function is available)
    if (typeof logAdminActivity === 'function') {
      logAdminActivity(
        admin.id,
        'login',
        'system',
        null,
        {},
        req.headers['x-forwarded-for'] || req.connection.remoteAddress
      ).catch(err => console.error('Failed to log admin activity:', err));
    }
    
    next();
  } catch (err) {
    console.error('Admin auth error:', err);
    res.status(401).json({ message: 'Invalid token' });
  }
};

/**
 * Permission-based middleware - checks if admin has specific permission
 * @param {string|Array} requiredPermissions - Permission(s) required for the route
 * @returns {Function} Express middleware function
 */
const checkPermission = (requiredPermissions) => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        return res.status(401).json({ message: 'Authentication required' });
      }
      
      // Legacy superadmin or admin with "all" permission always has access
      if (req.admin.is_legacy || req.admin.role.permissions.all === true) {
        return next();
      }
      
      const perms = req.admin.role.permissions;
      const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
      
      // Check if admin has any of the required permissions
      const hasPermission = required.some(permission => {
        // Check exact permission match
        if (perms[permission] === true) {
          return true;
        }
        
        // Check category permission (e.g., "users:view" matches if "users" is true)
        const category = permission.split(':')[0];
        if (perms[category] === true) {
          return true;
        }
        
        return false;
      });
      
      if (hasPermission) {
        return next();
      }
      
      res.status(403).json({ 
        message: 'Access denied. Insufficient permissions.', 
        requiredPermissions 
      });
    } catch (err) {
      console.error('Permission check error:', err);
      res.status(500).json({ message: 'Server error during permission check' });
    }
  };
};

/**
 * Middleware to restrict access to superadmins only
 */
const superadminOnly = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({ message: 'Authentication required' });
  }
  
  if (req.admin.is_legacy || req.admin.role.name === 'superadmin') {
    return next();
  }
  
  res.status(403).json({ message: 'Access denied. Superadmin privileges required.' });
};

/**
 * Helper function to log admin logout
 * @param {number} adminId - ID of the admin user
 * @param {string} ipAddress - IP address of the admin
 */
const logAdminLogout = async (adminId, ipAddress) => {
  try {
    if (typeof logAdminActivity === 'function') {
      await logAdminActivity(
        adminId,
        'logout',
        'system',
        null,
        {},
        ipAddress
      );
    }
  } catch (err) {
    console.error('Failed to log admin logout:', err);
  }
};

module.exports = {
  adminAuth,
  checkPermission,
  superadminOnly,
  logAdminLogout
}; 