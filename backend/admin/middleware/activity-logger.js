/**
 * Admin Activity Logger Middleware
 * Records admin actions to the activity log
 */

const pool = require('../../config/database');

/**
 * Log an admin action to the database
 * 
 * @param {number} adminUserId - The ID of the admin user
 * @param {string} action - The action performed (e.g., 'created', 'updated', 'deleted')
 * @param {string} targetType - The type of entity acted upon (e.g., 'user', 'task', 'role')
 * @param {number|string} targetId - The ID of the entity acted upon
 * @param {Object} details - Additional details about the action
 * @param {string} ipAddress - The IP address of the admin
 * @returns {Promise} Database query promise
 */
const logActivity = async (adminUserId, action, targetType, targetId, details = {}, ipAddress = null) => {
  try {
    // Don't log activity for legacy admin user
    if (adminUserId === 0) {
      return null;
    }
    
    const result = await pool.query(`
      INSERT INTO admin_activity_logs
        (admin_user_id, action, target_type, target_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [adminUserId, action, targetType, targetId, details, ipAddress]);
    
    return result.rows[0];
  } catch (error) {
    console.error('Error logging admin activity:', error);
    // Do not throw error - logging should not break application flow
    return null;
  }
};

/**
 * Middleware to log admin actions
 * 
 * @param {string} action - The action being performed
 * @param {string} targetType - The type of entity being acted upon
 * @param {function} getTargetId - Function to extract target ID from request
 * @param {function} getDetails - Function to extract details from request
 * @returns {Function} Express middleware function
 */
const activityLogger = (action, targetType, getTargetId, getDetails = null) => {
  return async (req, res, next) => {
    // Store the original res.json function
    const originalJson = res.json;
    
    // Override the res.json function to intercept successful responses
    res.json = function(data) {
      // Only log if response is successful (2xx status code)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const adminId = req.admin?.id;
          if (adminId) {
            const targetId = typeof getTargetId === 'function' ? getTargetId(req, data) : req.params[getTargetId];
            const details = getDetails ? getDetails(req, data) : {};
            const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            
            // Log activity asynchronously - don't wait for it
            logActivity(adminId, action, targetType, targetId, details, ip);
          }
        } catch (error) {
          console.error('Error in activity logger:', error);
        }
      }
      
      // Call the original json function
      return originalJson.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  logActivity,
  activityLogger
};