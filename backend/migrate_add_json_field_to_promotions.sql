-- Add JSON column to user_submitted_promotions table for tracking promotion data
ALTER TABLE user_submitted_promotions 
ADD COLUMN promotion_data JSONB DEFAULT '{}'::jsonb;

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
