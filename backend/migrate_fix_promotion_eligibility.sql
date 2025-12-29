-- Fix for checking promotion status in video-tasks.js and telegram-channels.js
-- This migration adds helper functions to correctly find eligible promotions

-- Function to get eligible promotion for a video task
CREATE OR REPLACE FUNCTION get_eligible_promotion_for_video(
  video_task_id INTEGER
) RETURNS TABLE (
  promotion_id INTEGER,
  reward_per_action INTEGER,
  cost_per_action INTEGER,
  admin_profit_per_action INTEGER,
  user_id BIGINT,
  target_views_joins INTEGER,
  current_views_joins INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    usp.id as promotion_id,
    usp.reward_per_action,
    usp.cost_per_action,
    usp.admin_profit_per_action,
    usp.user_id,
    usp.target_views_joins,
    usp.current_views_joins
  FROM youtube_tasks yt
  JOIN user_submitted_promotions usp ON yt.promotion_id = usp.id
  WHERE yt.id = video_task_id
    AND (usp.status = 'active' OR usp.status = 'approved')
    AND usp.current_views_joins < usp.target_views_joins
    AND usp.expires_at > NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get eligible promotion for a channel
CREATE OR REPLACE FUNCTION get_eligible_promotion_for_channel(
  channel_id INTEGER
) RETURNS TABLE (
  promotion_id INTEGER,
  reward_per_action INTEGER,
  cost_per_action INTEGER,
  admin_profit_per_action INTEGER,
  user_id BIGINT,
  target_views_joins INTEGER,
  current_views_joins INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    usp.id as promotion_id,
    usp.reward_per_action,
    usp.cost_per_action,
    usp.admin_profit_per_action,
    usp.user_id,
    usp.target_views_joins,
    usp.current_views_joins
  FROM telegram_channels tc
  JOIN user_submitted_promotions usp ON tc.promotion_id = usp.id
  WHERE tc.id = channel_id
    AND (usp.status = 'active' OR usp.status = 'approved')
    AND usp.current_views_joins < usp.target_views_joins
    AND usp.expires_at > NOW();
END;
$$ LANGUAGE plpgsql;
