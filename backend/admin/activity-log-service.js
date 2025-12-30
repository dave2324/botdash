const pool = require('../config/database');

/**
 * Utility function for logging admin activities.
 * Extracted into a standalone module to avoid circular dependencies between
 * `admin/auth.js` and `admin/activity-logs.js`.
 *
 * @param {number|string} adminUserId
 * @param {string} action
 * @param {string} targetType
 * @param {number|string|null} targetId
 * @param {any} details
 * @param {string|null} ipAddress
 * @returns {Promise<number|null>} Inserted activity log id.
 */
async function logAdminActivity(adminUserId, action, targetType, targetId, details, ipAddress) {
  try {
    const result = await pool.query(
      `
      INSERT INTO admin_activity_logs
        (admin_user_id, action, target_type, target_id, details, ip_address)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
      `,
      [adminUserId, action, targetType, targetId, details, ipAddress]
    );

    return result.rows[0].id;
  } catch (error) {
    console.error('Error logging admin activity:', error);
    // Don't throw error, just log it to avoid disrupting the main flow
    return null;
  }
}

module.exports = {
  logAdminActivity
};
