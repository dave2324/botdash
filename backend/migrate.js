#!/usr/bin/env node

/**
 * Migration entrypoint.
 *
 * Usage:
 *   npm run migrate
 *
 * Optional (fresh database):
 *   RUN_SCHEMA=true npm run migrate
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const pool = require('./config/database');
const { applyMigrations } = require('./migrations');

async function applySchema() {
  // 1) Base schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  const baseSql = fs.readFileSync(schemaPath, 'utf8');
  console.log('Applying schema.sql...');
  await pool.query(baseSql);
  console.log('schema.sql applied.');

  // 2) Additional schema updates living under ./migrations
  // These are treated as part of "initial schema" for fresh DBs.
  const extraDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(extraDir)) {
    const extraFiles = fs.readdirSync(extraDir)
      .filter((f) => f.endsWith('.sql'))
      .map((f) => path.join(extraDir, f))
      .sort();

    for (const file of extraFiles) {
      console.log(`Applying ${path.relative(__dirname, file)}...`);
      const sql = fs.readFileSync(file, 'utf8');
      await pool.query(sql);
    }
  }
}

async function isFreshDatabase() {
  // If a core table doesn't exist, this is almost certainly a fresh DB.
  // (Many migrations assume schema.sql has created the base tables.)
  try {
    const res = await pool.query("SELECT to_regclass('public.telegram_users') AS table_name");
    return !res.rows?.[0]?.table_name;
  } catch (e) {
    // If we can't query, let the main migrate step surface the real error.
    return false;
  }
}

async function main() {
  try {
    const runSchemaEnv = process.argv.includes('--run-schema') || String(process.env.RUN_SCHEMA).toLowerCase() === 'true';
    const autoSchema = String(process.env.AUTO_SCHEMA || 'true').toLowerCase() !== 'false';

    if (runSchemaEnv) {
      await applySchema();
    } else if (autoSchema && await isFreshDatabase()) {
      console.log('Detected fresh database (telegram_users missing). Applying schema.sql first...');
      await applySchema();
    }

    await applyMigrations();
  } finally {
    // Ensure the pool is closed so CI/one-off commands exit.
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
