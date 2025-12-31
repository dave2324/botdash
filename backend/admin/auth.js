const jwt = require('jsonwebtoken');

// Import activity logger (standalone module to avoid circular dependencies)
const { logAdminActivity } = require('./activity-log-service');

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

    // Use same secret as login route: env first, then dev fallback
    const jwtSecret = process.env.ADMIN_JWT_SECRET || 'dev-admin-secret';

    // Verify token
    const decoded = jwt.verify(token, jwtSecret);

    // For now, trust the decoded payload and treat it as a superadmin
    req.admin = {
      id: 0,
      username: decoded.username,
      role: {
        name: decoded.role || 'superadmin',
        permissions: { all: true }
      },
      is_legacy: decoded.is_legacy !== undefined ? decoded.is_legacy : true
    };

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