const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');
const { logger } = require('./config/logger');

async function runMigration() {
  try {
    logger.info('Starting channel verification migration');
    
    // Read SQL file
    const sqlPath = path.join(__dirname, 'migrate_add_channel_verification.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Execute SQL
    await pool.query(sql);
    
    logger.info('Channel verification migration completed successfully');
  } catch (error) {
    logger.error('Error running channel verification migration:', error);
    throw error;
  }
}

// Run migration if executed directly
if (require.main === module) {
  runMigration()
    .then(() => {
      logger.info('Migration script completed');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration failed:', err);
      process.exit(1);
    });
} else {
  module.exports = { runMigration };
}