-- Migration: Add require_premium field to youtube_tasks, telegram_channels, and user_submitted_promotions tables
-- Date: 2025-08-09
-- Description: Add BOOLEAN field to control premium requirement for tasks and promotions

-- Add require_premium column to youtube_tasks table
ALTER TABLE youtube_tasks 
ADD COLUMN IF NOT EXISTS require_premium BOOLEAN DEFAULT FALSE;

-- Add require_premium column to telegram_channels table
ALTER TABLE telegram_channels 
ADD COLUMN IF NOT EXISTS require_premium BOOLEAN DEFAULT FALSE;

-- Add require_premium column to user_submitted_promotions table
ALTER TABLE user_submitted_promotions 
ADD COLUMN IF NOT EXISTS require_premium BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN youtube_tasks.require_premium IS 'Whether premium membership is required to access this video task';
COMMENT ON COLUMN telegram_channels.require_premium IS 'Whether premium membership is required to join this channel';
COMMENT ON COLUMN user_submitted_promotions.require_premium IS 'Whether premium membership is required to engage with this promotion';
