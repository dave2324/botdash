-- Add premium-related settings to the settings table
INSERT INTO settings (key, value, description) VALUES
  ('premium_enabled', 1, 'Whether premium features are enabled (1) or disabled (0)'),
  ('premium_price', 299, 'Price for premium subscription in ETB'),
  ('premium_duration_days', 30, 'Duration of premium subscription in days'),
  ('premium_points_on_signup', 500, 'Bonus points awarded when a user upgrades to premium'),
  ('premium_max_spin_wheel_plays', 10, 'Maximum number of times a premium user can spin the wheel per day')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- Add Chapa payment gateway settings
INSERT INTO settings (key, value, description) VALUES
  ('chapa_api_key', '0', 'API key for Chapa payment gateway'),
  ('chapa_public_key', '0', 'Public key for Chapa payment gateway'),
  ('chapa_test_mode', 1, 'Whether Chapa is in test mode (1) or live mode (0)'),
  ('chapa_webhook_secret', '0', 'Webhook secret for Chapa payment gateway'),
  ('chapa_webhook_enabled', 1, 'Whether to process Chapa webhook notifications (1) or disable them (0)')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = NOW();
