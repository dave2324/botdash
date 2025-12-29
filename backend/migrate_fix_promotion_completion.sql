-- Migration to fix promotion completion handling

-- Update the handle_promotion_completion function to properly check promotion_id
CREATE OR REPLACE FUNCTION handle_promotion_completion(
  user_id_param BIGINT,
  promotion_id_param INTEGER,
  engagement_type_param VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  promotion_record RECORD;
  task_already_completed BOOLEAN;
  points_to_award INTEGER;
  cost_per_action INTEGER;
  admin_profit INTEGER;
  held_balance INTEGER;
BEGIN
  -- Check if promotion exists and is active
  SELECT * INTO promotion_record 
  FROM user_submitted_promotions 
  WHERE id = promotion_id_param AND status = 'active' AND expires_at > NOW();
  
  IF NOT FOUND THEN
    RETURN FALSE; -- Promotion not found or not active
  END IF;
  
  -- Check if user already completed this task
  SELECT EXISTS(
    SELECT 1 
    FROM user_promotion_engagements 
    WHERE user_id = user_id_param AND promotion_id = promotion_id_param AND engagement_type = engagement_type_param
  ) INTO task_already_completed;
  
  IF task_already_completed THEN
    RETURN FALSE; -- Already completed
  END IF;
  
  -- Get reward, cost, and admin profit
  points_to_award := COALESCE(promotion_record.reward_per_action, 0);
  cost_per_action := COALESCE(promotion_record.cost_per_action, 0);
  admin_profit := COALESCE(promotion_record.admin_profit_per_action, 0);
  
  -- Check held balance
  held_balance := COALESCE((promotion_record.promotion_stats->>'held_balance')::int, 0);
  
  -- Check if there's enough in held balance
  IF held_balance < cost_per_action THEN
    RETURN FALSE; -- Not enough balance
  END IF;
  
  -- Begin transaction
  BEGIN
    -- Create engagement record only if promotion_id is valid
    IF promotion_id_param IS NOT NULL THEN
      INSERT INTO user_promotion_engagements (
        user_id, promotion_id, engagement_type, points_awarded
      ) VALUES (
        user_id_param, promotion_id_param, engagement_type_param, points_to_award
      );
    END IF;
    
    -- Update promotion stats
    UPDATE user_submitted_promotions 
    SET 
      current_views_joins = current_views_joins + 1,
      updated_at = NOW(),
      promotion_stats = jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              promotion_stats,
              '{total_engagements}',
              (COALESCE((promotion_stats->>'total_engagements')::int, 0) + 1)::text::jsonb
            ),
            '{total_points_distributed}',
            (COALESCE((promotion_stats->>'total_points_distributed')::int, 0) + points_to_award)::text::jsonb
          ),
          '{total_admin_profit}',
          (COALESCE((promotion_stats->>'total_admin_profit')::int, 0) + admin_profit)::text::jsonb
        ),
        '{held_balance}',
        (held_balance - cost_per_action)::text::jsonb
      )
    WHERE id = promotion_id_param;
    
    -- Award points to user
    IF points_to_award > 0 THEN
      UPDATE telegram_users 
      SET points = points + points_to_award
      WHERE id = user_id_param;
    END IF;
    
    -- Update locked points for the promoter
    UPDATE telegram_users
    SET locked_points = locked_points - cost_per_action
    WHERE id = promotion_record.user_id;
    
    -- Check if promotion target reached or budget exhausted
    UPDATE user_submitted_promotions 
    SET 
      status = CASE 
        WHEN current_views_joins >= target_views_joins THEN 'completed'
        WHEN (promotion_stats->>'held_balance')::int < cost_per_action THEN 'budget_exhausted' 
        ELSE status 
      END,
      updated_at = NOW()
    WHERE id = promotion_id_param 
      AND (current_views_joins >= target_views_joins OR (promotion_stats->>'held_balance')::int < cost_per_action);
      
    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
      RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Fix the video-tasks completion function to properly check promotion_id
CREATE OR REPLACE FUNCTION safe_handle_promotion(
  user_id_param BIGINT,
  task_id_param INTEGER,
  task_type_param VARCHAR,
  engagement_type_param VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  promotion_id INTEGER;
  promotion_active BOOLEAN;
BEGIN
  -- First check if this is a promotion task
  IF task_type_param = 'youtube_video' THEN
    SELECT promotion_id INTO promotion_id
    FROM youtube_tasks
    WHERE id = task_id_param;
  ELSIF task_type_param = 'channel_join' THEN
    SELECT promotion_id INTO promotion_id
    FROM telegram_channels
    WHERE id = task_id_param;
  ELSE
    -- Not a supported promotion task type
    RETURN FALSE;
  END IF;
  
  -- If no promotion_id, not a promotion task
  IF promotion_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Check if promotion is active
  SELECT EXISTS (
    SELECT 1 FROM user_submitted_promotions
    WHERE id = promotion_id AND status = 'active'
  ) INTO promotion_active;
  
  IF NOT promotion_active THEN
    RETURN FALSE;
  END IF;
  
  -- If all checks pass, call the promotion completion handler
  RETURN handle_promotion_completion(user_id_param, promotion_id, engagement_type_param);
END;
$$ LANGUAGE plpgsql;
