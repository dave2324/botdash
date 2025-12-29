const fs = require('fs');
const path = require('path');
const pool = require('./config/database');

async function runCheckinsMigration() {
  try {
    console.log('Starting checkins BIGINT migration...');
    
    // Check if tables exist first
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('daily_checkins', 'checkin_settings', 'telegram_users')
    `);
    
    const existingTables = tablesResult.rows.map(row => row.table_name);
    console.log('Existing tables:', existingTables);
    
    // If tables don't exist, create them first
    if (!existingTables.includes('daily_checkins') || !existingTables.includes('checkin_settings')) {
      console.log('Creating missing tables...');
      
      // Read and execute the new features schema
      const schemaPath = path.join(__dirname, 'migrations', 'new_features_schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSQL = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schemaSQL);
        console.log('Schema created successfully!');
      }
    }
    
    // Check current data type of user_id in daily_checkins
    const columnResult = await pool.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = 'daily_checkins' 
      AND column_name = 'user_id'
    `);
    
    if (columnResult.rows.length > 0) {
      const currentType = columnResult.rows[0].data_type;
      console.log(`Current user_id data type: ${currentType}`);
      
      if (currentType === 'integer') {
        console.log('Fixing user_id data type from INTEGER to BIGINT...');
        
        // Read the migration file
        const migrationPath = path.join(__dirname, 'migrate_fix_checkins_bigint.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Execute the migration
        await pool.query(migrationSQL);
        
        console.log('Migration completed successfully!');
        
        // Verify the migration
        const verifyResult = await pool.query(`
          SELECT data_type 
          FROM information_schema.columns 
          WHERE table_name = 'daily_checkins' 
          AND column_name = 'user_id'
        `);
        
        console.log(`New user_id data type: ${verifyResult.rows[0].data_type}`);
      } else {
        console.log('user_id is already BIGINT, no migration needed.');
      }
    } else {
      console.log('daily_checkins table or user_id column not found!');
    }
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runCheckinsMigration();