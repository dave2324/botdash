-- Add promotion settings to the settings table
INSERT INTO settings (key, value, description) VALUES
  ('channel_join_reward_points', 8, 'Points awarded to users for joining a promoted channel'),
  ('channel_join_admin_profit', 2, 'Admin profit for each channel join promotion action'),
  ('video_boost_reward_points', 6, 'Points awarded to users for watching a promoted video'),
  ('video_boost_admin_profit', 2, 'Admin profit for each video boost promotion action')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- Add helper function to calculate cost per action
CREATE OR REPLACE FUNCTION calculate_promotion_cost_per_action(
  promotion_type VARCHAR(20)
) RETURNS INTEGER AS $$
DECLARE
  reward_points INTEGER;
  admin_profit INTEGER;
BEGIN
  IF promotion_type = 'channel_join' THEN
    SELECT value INTO reward_points FROM settings WHERE key = 'channel_join_reward_points';
    SELECT value INTO admin_profit FROM settings WHERE key = 'channel_join_admin_profit';
  ELSIF promotion_type = 'video_boost' THEN
    SELECT value INTO reward_points FROM settings WHERE key = 'video_boost_reward_points';
    SELECT value INTO admin_profit FROM settings WHERE key = 'video_boost_admin_profit';
  ELSE
    RAISE EXCEPTION 'Invalid promotion type: %', promotion_type;
  END IF;
  
  RETURN reward_points + admin_profit;
END;
$$ LANGUAGE plpgsql;

-- Add columns to user_submitted_promotions table
ALTER TABLE user_submitted_promotions
ADD COLUMN cost_per_action INTEGER,
ADD COLUMN reward_per_action INTEGER,
ADD COLUMN admin_profit_per_action INTEGER;
