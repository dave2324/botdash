const pool = require('./config/database');

async function fixCheckinDataType() {
  try {
    console.log('Checking daily_checkins table...');
    
    // Check if the table exists and what the current data type is
    const result = await pool.query(`
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'daily_checkins' 
      AND column_name = 'user_id'
    `);
    
    if (result.rows.length === 0) {
      console.log('Table daily_checkins does not exist or user_id column not found');
      // Create the table with correct schema
      await pool.query(`
        CREATE TABLE IF NOT EXISTS daily_checkins (
          id SERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES telegram_users(id),
          check_in_date DATE NOT NULL,
          streak_count INTEGER NOT NULL DEFAULT 1,
          points_awarded INTEGER DEFAULT 0,
          milestone_reached INTEGER DEFAULT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(user_id, check_in_date)
        );
      `);
      console.log('Created daily_checkins table with BIGINT user_id');
    } else {
      const currentType = result.rows[0].data_type;
      console.log(`Current user_id data type: ${currentType}`);
      
      if (currentType === 'integer') {
        console.log('Fixing data type...');
        await pool.query('ALTER TABLE daily_checkins ALTER COLUMN user_id TYPE BIGINT;');
        console.log('Fixed user_id data type to BIGINT');
      } else {
        console.log('Data type is already correct');
      }
    }
    
    // Also create checkin_settings if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS checkin_settings (
        id SERIAL PRIMARY KEY,
        day_number INTEGER NOT NULL UNIQUE,
        points_reward INTEGER NOT NULL DEFAULT 10,
        is_milestone BOOLEAN DEFAULT false,
        milestone_bonus INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    // Insert default settings
    await pool.query(`
      INSERT INTO checkin_settings (day_number, points_reward, is_milestone, milestone_bonus) VALUES 
      (1, 10, false, 0), (2, 15, false, 0), (3, 20, false, 0), (4, 25, false, 0), (5, 30, false, 0),
      (6, 35, false, 0), (7, 50, true, 100), (8, 40, false, 0), (9, 45, false, 0), (10, 50, false, 0),
      (11, 55, false, 0), (12, 60, false, 0), (13, 65, false, 0), (14, 100, true, 200), 
      (15, 70, false, 0), (16, 75, false, 0), (17, 80, false, 0), (18, 85, false, 0), (19, 90, false, 0),
      (20, 95, false, 0), (21, 150, true, 300), (22, 100, false, 0), (23, 105, false, 0), (24, 110, false, 0),
      (25, 115, false, 0), (26, 120, false, 0), (27, 125, false, 0), (28, 200, true, 500), 
      (29, 130, false, 0), (30, 300, true, 1000)
      ON CONFLICT (day_number) DO NOTHING;
    `);
    
    console.log('Daily check-in system is ready!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

fixCheckinDataType();