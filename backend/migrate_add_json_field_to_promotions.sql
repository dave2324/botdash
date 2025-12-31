-- Add JSON column to user_submitted_promotions table for tracking promotion data
ALTER TABLE user_submitted_promotions 
ADD COLUMN promotion_data JSONB DEFAULT '{}'::jsonb;

-- Ensure task_progress exists (older databases may not have it)
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

-- Create function to update promotion stats
CREATE OR REPLACE FUNCTION update_promotion_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the promotion_data field with completion statistics
  UPDATE user_submitted_promotions
  SET promotion_data = jsonb_build_object(
    'completed_count', (
      SELECT COUNT(*)
      FROM task_progress
      WHERE task_id = NEW.task_id
      AND task_type = NEW.task_type
      AND status = 'completed'
    ),
    'pending_count', (
      SELECT COUNT(*)
      FROM task_progress
      WHERE task_id = NEW.task_id
      AND task_type = NEW.task_type
      AND status = 'pending'
    ),
    'total_points_awarded', (
      SELECT COALESCE(SUM(points_earned), 0)
      FROM task_progress
      WHERE task_id = NEW.task_id
      AND task_type = NEW.task_type
      AND status = 'completed'
    ),
    'last_updated', NOW()
  )
  FROM (
    SELECT promotion_id 
    FROM telegram_channels 
    WHERE id = NEW.task_id AND NEW.task_type = 'channel_join'
    UNION
    SELECT promotion_id 
    FROM youtube_tasks 
    WHERE id = NEW.task_id AND NEW.task_type = 'youtube_video'
  ) AS task_info
  WHERE id = task_info.promotion_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update promotion stats when task_progress is updated
DROP TRIGGER IF EXISTS update_promotion_stats_trigger ON task_progress;
CREATE TRIGGER update_promotion_stats_trigger
AFTER INSERT OR UPDATE ON task_progress
FOR EACH ROW
WHEN (NEW.task_type IN ('channel_join', 'youtube_video'))
EXECUTE FUNCTION update_promotion_stats();
