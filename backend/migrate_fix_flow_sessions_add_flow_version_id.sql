-- Fix: flow_sessions missing flow_version_id column
-- Safe migration: adds the column if it doesn't exist.

ALTER TABLE IF EXISTS flow_sessions
  ADD COLUMN IF NOT EXISTS flow_version_id INT NULL;

-- Optional index for lookup
CREATE INDEX IF NOT EXISTS idx_flow_sessions_flow_version_id
  ON flow_sessions(flow_version_id);
