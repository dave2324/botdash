const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config/database-config');

const pool = new Pool(config);

async function runMigration() {
  try {
    console.log('Running channel verification settings migration...');
    
    const migrationFilePath = path.join(__dirname, 'migrate_add_channel_verification_settings.sql');
    const sql = fs.readFileSync(migrationFilePath, 'utf8');
    
    await pool.query(sql);
    
    console.log('Channel verification settings migration completed successfully.');
  } catch (error) {
    console.error('Error running migration:', error);
  } finally {
    await pool.end();
  }
}

runMigration();