const { Pool } = require('pg');

// Create a single pool instance to be shared across the application
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  // Optimized connection pool configuration for Supabase
  max: 10, // Max connections for remote DB
  min: 1, // Keep minimum connections alive
  idleTimeoutMillis: 60000, // Longer idle timeout for stability (60s)
  connectionTimeoutMillis: 30000, // Increased connection timeout for remote DB (30s)
  maxUses: 7500, // Limit connection reuse to prevent memory leaks
  acquireTimeoutMillis: 5000, // Longer timeout for acquiring connection (5s)
  createTimeoutMillis: 10000, // Longer timeout for creating new connections (10s)
  destroyTimeoutMillis: 5000, // Timeout for destroying connections
  reapIntervalMillis: 5000, // Check for idle connections less frequently
  createRetryIntervalMillis: 500, // Retry interval for failed connections
  // Additional settings for stability
  statement_timeout: 30000, // 30 second query timeout
  query_timeout: 30000, // 30 second query timeout
  ssl: { rejectUnauthorized: false } // Required for Supabase connections
});

// Handle pool errors with better logging and recovery
pool.on('error', (err) => {
  console.error('Database pool error:', {
    message: err.message,
    code: err.code,
    severity: err.severity,
    detail: err.detail,
    timestamp: new Date().toISOString()
  });

  // Don't exit on connection errors - let the pool handle reconnection
  if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND') {
    console.log('Connection error detected, pool will attempt to reconnect...');
    return;
  }

  // Only exit on severe errors
  if (err.severity === 'FATAL' || err.severity === 'PANIC') {
    console.error('Fatal database error, shutting down...');
    process.exit(-1);
  }
});

// Add connection event logging
pool.on('connect', (client) => {
  console.log('Database client connected');
});

pool.on('remove', (client) => {
  console.log('Database client removed from pool');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

module.exports = pool;
