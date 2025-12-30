// Check for and run any pending migrations during backend startup

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { logger } = require('./config/logger');

// Database connection
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: { rejectUnauthorized: false }
    });

// Create migrations table if it doesn't exist
async function ensureMigrationsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS db_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW()
      );
    `);
    logger.log('Migrations table check complete');
  } catch (error) {
    logger.error('Error ensuring migrations table exists:', error);
    throw error;
  }
}

// Check if a migration has been applied
async function isMigrationApplied(migrationName) {
  const result = await pool.query(
    'SELECT COUNT(*) FROM db_migrations WHERE migration_name = $1',
    [migrationName]
  );
  return parseInt(result.rows[0].count) > 0;
}

// Record a migration as applied
async function recordMigration(migrationName) {
  await pool.query(
    'INSERT INTO db_migrations (migration_name) VALUES ($1)',
    [migrationName]
  );
  logger.log(`Recorded migration: ${migrationName}`);
}

// Apply a migration file
async function applyMigration(migrationFile) {
  const migrationName = path.basename(migrationFile);
  
  // Skip if already applied
  if (await isMigrationApplied(migrationName)) {
    logger.log(`Migration already applied: ${migrationName}`);
    return false;
  }
  
  logger.log(`Applying migration: ${migrationName}`);
  const client = await pool.connect();
  
  try {
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO db_migrations (migration_name) VALUES ($1)',
      [migrationName]
    );
    await client.query('COMMIT');
    
    logger.log(`Successfully applied migration: ${migrationName}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Migration failed: ${migrationName}`, error);
    throw error;
  } finally {
    client.release();
  }
}

// Find and apply all pending migrations
async function applyMigrations() {
  try {
    // Ensure migrations table exists
    await ensureMigrationsTable();
    
    // Get all migration files
    const migrationFiles = fs.readdirSync(__dirname)
      .filter(file => file.startsWith('migrate_') && file.endsWith('.sql'))
      .map(file => path.join(__dirname, file))
      .sort(); // Sort to apply in alphabetical order
    
    // Apply each migration
    let appliedCount = 0;
    for (const migrationFile of migrationFiles) {
      const applied = await applyMigration(migrationFile);
      if (applied) appliedCount++;
    }
    
    if (appliedCount > 0) {
      logger.log(`Applied ${appliedCount} migrations`);
    } else {
      logger.log('No new migrations to apply');
    }
  } catch (error) {
    logger.error('Error applying migrations:', error);
    process.exit(1);
  }
}

module.exports = { applyMigrations };
