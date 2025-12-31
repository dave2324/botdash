-- Migration to add channel verification system

-- Ensure settings table exists for storing configuration values
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add verification frequency setting
INSERT INTO settings (key, value, description) 
VALUES ('channel_verification_frequency_hours', '24', 'How often to check if users have left channels (in hours)')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- Ensure task_progress exists (older databases may not have it if schema.sql wasn't run/updated)
DO $$
BEGIN
  IF to_regclass('public.task_progress') IS NULL THEN
    IF to_regclass('public.telegram_users') IS NULL THEN
      RAISE EXCEPTION 'Missing required table telegram_users. Run: RUN_SCHEMA=true npm run migrate (or npm run migrate:all) to initialize schema.';
    END IF;

    CREATE TABLE task_progress (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES telegram_users(id),
      task_type VARCHAR(50) NOT NULL,
      task_id INTEGER NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      points_earned INTEGER DEFAULT 0,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, task_type, task_id)
    );

    CREATE INDEX IF NOT EXISTS idx_task_progress_user_id ON task_progress(user_id);
    CREATE INDEX IF NOT EXISTS idx_task_progress_task_type ON task_progress(task_type);
    CREATE INDEX IF NOT EXISTS idx_task_progress_status ON task_progress(status);
  END IF;
END $$;

-- Add columns to task_progress for verification tracking
ALTER TABLE task_progress 
ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS next_verification_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS membership_status VARCHAR(20) DEFAULT 'active',
ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- Create table for keeping track of channel membership verification
CREATE TABLE IF NOT EXISTS channel_membership_verifications (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  channel_id INTEGER NOT NULL REFERENCES telegram_channels(id),
  verification_time TIMESTAMP DEFAULT NOW(),
  is_member BOOLEAN NOT NULL,
  UNIQUE(user_id, channel_id, verification_time)
);

-- Create index for channel membership verifications lookups
CREATE INDEX idx_channel_membership_verifications_user_id ON channel_membership_verifications(user_id);
CREATE INDEX idx_channel_membership_verifications_channel_id ON channel_membership_verifications(channel_id);
CREATE INDEX idx_channel_membership_verifications_time ON channel_membership_verifications(verification_time);

-- Add has_left_channels field to telegram_users to track if user has left any channel
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS has_left_channels BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS earning_tasks_suspended BOOLEAN DEFAULT FALSE;

-- Add tasks_suspended_reason to telegram_users
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS tasks_suspended_reason TEXT;

-- Add last_channel_verification to telegram_users
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS last_channel_verification TIMESTAMP,
ADD COLUMN IF NOT EXISTS next_channel_verification TIMESTAMP;