-- Add locked_points column to telegram_users table for holding points allocated to promotions
ALTER TABLE telegram_users
ADD COLUMN locked_points INT DEFAULT 0;

-- Add promotion_stats JSONB column to user_submitted_promotions to track distribution
ALTER TABLE user_submitted_promotions
ADD COLUMN promotion_stats JSONB DEFAULT '{
  "total_engagements": 0,
  "total_points_distributed": 0,
  "total_admin_profit": 0,
  "held_balance": 0
}'::JSONB;

-- Create function to handle promotion task completion
CREATE OR REPLACE FUNCTION handle_promotion_completion(
  user_id_param BIGINT,
  promotion_id_param INTEGER,
  engagement_type_param VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  promotion_record RECORD;
  task_already_completed BOOLEAN;
  points_to_award INTEGER;
  admin_profit INTEGER;
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
  
  -- Get reward and admin profit
  points_to_award := promotion_record.reward_per_action;
  admin_profit := promotion_record.admin_profit_per_action;
  
  -- Begin transaction
  BEGIN
    -- Create engagement record
    INSERT INTO user_promotion_engagements (
      user_id, promotion_id, engagement_type, points_awarded
    ) VALUES (
      user_id_param, promotion_id_param, engagement_type_param, points_to_award
    );
    
    -- Update promotion stats
    UPDATE user_submitted_promotions 
    SET 
      current_views_joins = current_views_joins + 1,
      updated_at = NOW(),
      promotion_stats = jsonb_set(
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
      -- Reduce held balance
      promotion_stats = jsonb_set(
        promotion_stats,
        '{held_balance}',
        (COALESCE((promotion_stats->>'held_balance')::int, 0) - (points_to_award + admin_profit))::text::jsonb
      )
    WHERE id = promotion_id_param;
    
    -- Award points to user
    IF points_to_award > 0 THEN
      UPDATE telegram_users 
      SET points = points + points_to_award
      WHERE id = user_id_param;
    END IF;
    
    -- Check if promotion target reached
    UPDATE user_submitted_promotions 
    SET status = 'completed', updated_at = NOW()
    WHERE id = promotion_id_param 
      AND current_views_joins >= target_views_joins;
      
    RETURN TRUE;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE;
      RETURN FALSE;
  END;
END;
$$ LANGUAGE plpgsql;

-- Create function to refund unused promotion points
CREATE OR REPLACE FUNCTION refund_promotion_points(
  promotion_id_param INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
  promotion_record RECORD;
  refund_amount INTEGER;
BEGIN
  -- Get promotion details
  SELECT * INTO promotion_record 
  FROM user_submitted_promotions 
  WHERE id = promotion_id_param;
  
  IF NOT FOUND THEN
    RETURN FALSE; -- Promotion not found
  END IF;
  
  -- Calculate refund amount (remaining held balance)
  refund_amount := COALESCE((promotion_record.promotion_stats->>'held_balance')::int, 0);
  
  IF refund_amount <= 0 THEN
    RETURN TRUE; -- No refund needed
  END IF;
  
  -- Process refund
  UPDATE telegram_users
  SET 
    points = points + refund_amount,
    locked_points = locked_points - refund_amount
  WHERE id = promotion_record.user_id;
  
  -- Clear held balance
  UPDATE user_submitted_promotions
  SET promotion_stats = jsonb_set(
    promotion_stats,
    '{held_balance}',
    '0'::jsonb
  )
  WHERE id = promotion_id_param;
  
  RETURN TRUE;
EXCEPTION
  WHEN OTHERS THEN
    RAISE;
    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;
