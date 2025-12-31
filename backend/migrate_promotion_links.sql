-- Migration to add promotion_id column and foreign key constraints to link youtube_tasks and telegram_channels to user_submitted_promotions

-- Add promotion_id columns (idempotent)
ALTER TABLE youtube_tasks
ADD COLUMN IF NOT EXISTS promotion_id INT;

ALTER TABLE telegram_channels
ADD COLUMN IF NOT EXISTS promotion_id INT;

-- Add foreign key constraint to youtube_tasks.promotion_id (only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'youtube_tasks'
      AND tc.constraint_name = 'fk_youtube_tasks_promotion'
  ) THEN
    ALTER TABLE youtube_tasks
      ADD CONSTRAINT fk_youtube_tasks_promotion
      FOREIGN KEY (promotion_id)
      REFERENCES user_submitted_promotions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key constraint to telegram_channels.promotion_id (only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'telegram_channels'
      AND tc.constraint_name = 'fk_telegram_channels_promotion'
  ) THEN
    ALTER TABLE telegram_channels
      ADD CONSTRAINT fk_telegram_channels_promotion
      FOREIGN KEY (promotion_id)
      REFERENCES user_submitted_promotions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- Add indexes to improve lookup performance
CREATE INDEX IF NOT EXISTS idx_youtube_tasks_promotion_id ON youtube_tasks(promotion_id);
CREATE INDEX IF NOT EXISTS idx_telegram_channels_promotion_id ON telegram_channels(promotion_id);
