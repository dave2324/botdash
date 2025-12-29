#!/usr/bin/env node

const fs = require('fs');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Create a connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function runMigration() {
  try {
    const client = await pool.connect();
    
    try {
      console.log('Running promotion links migration...');
      
      // Read migration SQL file
      const migrationSQL = fs.readFileSync(path.join(__dirname, 'migrate_promotion_links.sql'), 'utf8');
      
      // Execute migration
      await client.query(migrationSQL);
      
      console.log('Migration completed successfully!');
    } catch (err) {
      console.error('Error executing migration:', err);
      process.exit(1);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error connecting to database:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
