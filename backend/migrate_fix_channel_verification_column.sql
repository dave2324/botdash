-- Migration to add the missing next_channel_verification column to telegram_users

-- Add next_channel_verification to telegram_users if it doesn't exist
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS next_channel_verification TIMESTAMP;

-- Update existing users to have a next verification time
UPDATE telegram_users
SET next_channel_verification = NOW() + INTERVAL '24 hours'
WHERE next_channel_verification IS NULL;