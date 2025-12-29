-- Migration to ensure locked_points exists in telegram_users table and fix promotion stats
-- Step 1: Check if the locked_points column already exists
DO $$
BEGIN
  -- Check if the column already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'telegram_users' 
    AND column_name = 'locked_points'
  ) THEN
    -- Add the locked_points column if it doesn't exist
    ALTER TABLE telegram_users
    ADD COLUMN locked_points INT DEFAULT 0;
    
    RAISE NOTICE 'Added locked_points column to telegram_users table';
  ELSE
    RAISE NOTICE 'locked_points column already exists in telegram_users table';
  END IF;
END $$;

-- Step 2: Fix promotion_stats for all promotions
UPDATE user_submitted_promotions
SET promotion_stats = COALESCE(promotion_stats, '{}')::jsonb || '{
  "total_engagements": 0,
  "total_points_distributed": 0,
  "total_admin_profit": 0,
  "held_balance": 0
}'::jsonb
WHERE promotion_stats IS NULL OR promotion_stats = '{}'::jsonb;

-- Step 3: Update promotion statistics based on actual engagement data
WITH engagement_stats AS (
  SELECT 
    promotion_id,
    COUNT(*) as total_count,
    COALESCE(SUM(points_awarded), 0) as total_points_awarded
  FROM user_promotion_engagements
  GROUP BY promotion_id
)
UPDATE user_submitted_promotions usp
SET 
  current_views_joins = es.total_count,
  promotion_stats = jsonb_set(
    jsonb_set(
      jsonb_set(
        promotion_stats,
        '{total_engagements}',
        es.total_count::text::jsonb
      ),
      '{total_points_distributed}',
      es.total_points_awarded::text::jsonb
    ),
    '{total_admin_profit}',
    (es.total_count * COALESCE(usp.admin_profit_per_action, 0))::text::jsonb
  )
FROM engagement_stats es
WHERE usp.id = es.promotion_id;

-- Step 4: Fix held_balance for active promotions
UPDATE user_submitted_promotions
SET promotion_stats = jsonb_set(
  promotion_stats,
  '{held_balance}',
  ((target_views_joins - current_views_joins) * cost_per_action)::text::jsonb
)
WHERE status = 'active';

-- Step 5: Synchronize locked_points with actual promotion held balances
WITH user_promotion_points AS (
  SELECT 
    user_id,
    SUM((promotion_stats->>'held_balance')::int) as total_held_points
  FROM user_submitted_promotions
  WHERE status = 'active'
  GROUP BY user_id
)
UPDATE telegram_users tu
SET locked_points = COALESCE(upp.total_held_points, 0)
FROM user_promotion_points upp
WHERE tu.id = upp.user_id;

-- Step 6: If a user has negative available points after fixing locked points, adjust their balance
UPDATE telegram_users
SET points = points + locked_points
WHERE points < 0;
