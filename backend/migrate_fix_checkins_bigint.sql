-- Fix user_id column type in daily_checkins to match telegram_users.id (BIGINT)
-- This migration ensures data type consistency for Telegram user IDs

-- Drop existing foreign key constraint if it exists
ALTER TABLE daily_checkins DROP CONSTRAINT IF EXISTS daily_checkins_user_id_fkey;

-- Change user_id column type from INTEGER to BIGINT
ALTER TABLE daily_checkins ALTER COLUMN user_id TYPE BIGINT;

-- Re-add the foreign key constraint
ALTER TABLE daily_checkins 
ADD CONSTRAINT daily_checkins_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES telegram_users(id);

-- Update indexes if needed
DROP INDEX IF EXISTS idx_daily_checkins_user_id;
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_id ON daily_checkins(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_date ON daily_checkins(check_in_date);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, check_in_date);