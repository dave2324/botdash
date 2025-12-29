/**
 * Initialize Admin Roles and Default Superadmin Account
 */

const bcrypt = require('bcrypt');
const pool = require('../config/database');

async function initializeAdminRoles() {
  console.log('Initializing admin roles and default superadmin account...');

  try {
    // Check if required environment variables are set
    if (!process.env.DEFAULT_ADMIN_USERNAME || !process.env.DEFAULT_ADMIN_PASSWORD || !process.env.ADMIN_JWT_SECRET) {
      console.error('Error: Missing required environment variables:');
      if (!process.env.DEFAULT_ADMIN_USERNAME) console.error('- DEFAULT_ADMIN_USERNAME not set');
      if (!process.env.DEFAULT_ADMIN_PASSWORD) console.error('- DEFAULT_ADMIN_PASSWORD not set');
      if (!process.env.ADMIN_JWT_SECRET) console.error('- ADMIN_JWT_SECRET not set');
      return false;
    }

    // Start transaction
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if roles table exists, if not, create it
      const tablesExist = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'admin_roles'
        )
      `);

      // If tables don't exist yet, we'll assume migrations will handle it
      if (!tablesExist.rows[0].exists) {
        console.log('Admin tables do not exist yet. Skipping initialization.');
        await client.query('ROLLBACK');
        return false;
      }

      // Check if superadmin role exists
      const superadminExists = await client.query(`
        SELECT id FROM admin_roles WHERE name = 'superadmin'
      `);

      let superadminRoleId;

      if (superadminExists.rows.length === 0) {
        // Create superadmin role
        const roleResult = await client.query(`
          INSERT INTO admin_roles (name, description, permissions, is_active, created_at, updated_at)
          VALUES ('superadmin', 'Full system access', '{"all": true}', TRUE, NOW(), NOW())
          RETURNING id
        `);
        superadminRoleId = roleResult.rows[0].id;
        console.log('Created superadmin role with ID:', superadminRoleId);
      } else {
        superadminRoleId = superadminExists.rows[0].id;
        console.log('Superadmin role already exists with ID:', superadminRoleId);
      }

      // Check if admin role exists
      const adminExists = await client.query(`
        SELECT id FROM admin_roles WHERE name = 'admin'
      `);

      if (adminExists.rows.length === 0) {
        // Create admin role
        const roleResult = await client.query(`
          INSERT INTO admin_roles (name, description, permissions, is_active, created_at, updated_at)
          VALUES ('admin', 'Limited admin access', '{"dashboard": true, "users": true, "tasks": true, "moderate": true}', TRUE, NOW(), NOW())
          RETURNING id
        `);
        console.log('Created admin role with ID:', roleResult.rows[0].id);
      } else {
        console.log('Admin role already exists');
      }

      // Check if staff role exists
      const staffExists = await client.query(`
        SELECT id FROM admin_roles WHERE name = 'staff'
      `);

      if (staffExists.rows.length === 0) {
        // Create staff role
        const roleResult = await client.query(`
          INSERT INTO admin_roles (name, description, permissions, is_active, created_at, updated_at)
          VALUES ('staff', 'Basic moderation access', '{"dashboard:view": true, "moderate:approve": true, "moderate:reject": true}', TRUE, NOW(), NOW())
          RETURNING id
        `);
        console.log('Created staff role with ID:', roleResult.rows[0].id);
      } else {
        console.log('Staff role already exists');
      }

      // Check if default superadmin account exists
      const defaultAdminExists = await client.query(`
        SELECT id FROM admin_users WHERE username = $1
      `, [process.env.DEFAULT_ADMIN_USERNAME]);

      if (defaultAdminExists.rows.length === 0) {
        // Create default superadmin account
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(process.env.DEFAULT_ADMIN_PASSWORD, salt);

        const userResult = await client.query(`
          INSERT INTO admin_users 
            (username, email, password_hash, role_id, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
          RETURNING id
        `, [
          process.env.DEFAULT_ADMIN_USERNAME,
          process.env.DEFAULT_ADMIN_EMAIL || null,
          hashedPassword,
          superadminRoleId
        ]);

        console.log('Created default superadmin account with ID:', userResult.rows[0].id);
      } else {
        console.log('Default superadmin account already exists');
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error initializing admin roles:', error);
    return false;
  }
}

// Export the function to be called from index.js on startup
module.exports = {
  initializeAdminRoles
};