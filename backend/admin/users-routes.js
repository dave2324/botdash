/**
 * Admin Users Routes Forwarding
 * This file provides compatibility for /admin/users/* routes
 * to forward to the correct /admin/staff/* endpoints
 */

// Simply re-export the staff router to make it available at /admin/users as well
module.exports = require('./admin-users');