-- Migration to add channel verification system

-- Add verification frequency setting
INSERT INTO settings (key, value, description) 
VALUES ('channel_verification_frequency_hours', '24', 'How often to check if users have left channels (in hours)')
ON CONFLICT (key) DO UPDATE SET 
  value = EXCLUDED.value,
  description = EXCLUDED.description;

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