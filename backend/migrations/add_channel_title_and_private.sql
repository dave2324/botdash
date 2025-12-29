-- Migration: Add title and isPrivate columns to telegram_channels table
-- Run this script to update existing database schema

-- Add title column if it doesn't exist
ALTER TABLE telegram_channels ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- Add isPrivate column if it doesn't exist
ALTER TABLE telegram_channels ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;

-- Update existing records to set isPrivate based on is_public
-- Private channels are those that are not public
UPDATE telegram_channels 
SET is_private = NOT is_public 
WHERE is_private IS NULL;

-- Add comment to document the migration
COMMENT ON COLUMN telegram_channels.title IS 'Display name of the channel';
COMMENT ON COLUMN telegram_channels.is_private IS 'Whether the channel is private (no public username)'; 