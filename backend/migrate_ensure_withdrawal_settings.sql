-- Ensure withdrawal_min_points setting exists
INSERT INTO settings (key, value, description)
VALUES ('withdrawal_min_points', '1000', 'Minimum points required for withdrawal')
ON CONFLICT (key) DO NOTHING;

-- Ensure premium_withdrawal_min_points setting exists (optional, can be different from regular)
INSERT INTO settings (key, value, description)
VALUES ('premium_withdrawal_min_points', '0', 'Minimum points for premium users (0 = use regular setting)')
ON CONFLICT (key) DO NOTHING;

-- Ensure other withdrawal settings exist
INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_enabled', '1', 'Enable or disable withdrawals globally')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_max_points', '50000', 'Maximum points per withdrawal')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_frequency', 'daily', 'How often users can withdraw (daily/weekly/monthly)')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_daily_limit', '5000', 'Daily withdrawal limit in ETB')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_weekly_limit', '20000', 'Weekly withdrawal limit in ETB')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_monthly_limit', '50000', 'Monthly withdrawal limit in ETB')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_min_account_age_days', '7', 'Minimum account age in days')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_min_tasks_completed', '10', 'Minimum tasks completed requirement')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('conversion_rate_points_to_etb', '0.1', 'Points to ETB conversion rate')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('premium_withdrawal_bonus_percent', '20', 'Bonus percentage for premium users')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('premium_withdrawal_frequency', 'unlimited', 'Withdrawal frequency for premium users')
  ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES 
  ('premium_withdrawal_daily_limit', '10000', 'Daily withdrawal limit for premium users in ETB')
  ON CONFLICT (key) DO NOTHING;