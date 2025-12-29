-- Migration to add promotion_id column and foreign key constraints to link youtube_tasks and telegram_channels to user_submitted_promotions
-- First, add promotion_id column to youtube_tasks
ALTER TABLE youtube_tasks
ADD COLUMN promotion_id INT;

-- Then, add promotion_id column to telegram_channels
ALTER TABLE telegram_channels
ADD COLUMN promotion_id INT;

-- Next, add foreign key constraint to youtube_tasks.promotion_id
ALTER TABLE youtube_tasks
ADD CONSTRAINT fk_youtube_tasks_promotion
FOREIGN KEY (promotion_id) 
REFERENCES user_submitted_promotions(id)
ON DELETE SET NULL;

-- Add foreign key constraint to telegram_channels.promotion_id
ALTER TABLE telegram_channels
ADD CONSTRAINT fk_telegram_channels_promotion
FOREIGN KEY (promotion_id) 
REFERENCES user_submitted_promotions(id)
ON DELETE SET NULL;

-- Add indexes to improve lookup performance
CREATE INDEX idx_youtube_tasks_promotion_id ON youtube_tasks(promotion_id);
CREATE INDEX idx_telegram_channels_promotion_id ON telegram_channels(promotion_id);
