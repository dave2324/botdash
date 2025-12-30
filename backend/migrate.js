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
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  console.log('Applying schema.sql...');
  await pool.query(sql);
  console.log('schema.sql applied.');
}

async function main() {
  try {
    if (String(process.env.RUN_SCHEMA).toLowerCase() === 'true') {
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
