-- Add is_promotion column to telegram_channels
ALTER TABLE telegram_channels 
ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN DEFAULT FALSE;

-- Add is_promotion column to youtube_tasks
ALTER TABLE youtube_tasks 
ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN DEFAULT FALSE;

-- Update existing records where promotion_id is not null
UPDATE telegram_channels 
SET is_promotion = TRUE 
WHERE promotion_id IS NOT NULL;

UPDATE youtube_tasks 
SET is_promotion = TRUE 
WHERE promotion_id IS NOT NULL;
