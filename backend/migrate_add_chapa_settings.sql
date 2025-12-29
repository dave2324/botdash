-- Migration: Add Chapa payment gateway settings
-- Run this migration to add Chapa payment settings to the settings table

INSERT INTO settings (key, value, description) VALUES
  ('chapa_api_key', '', 'Chapa secret API key for payment processing'),
  ('chapa_public_key', '', 'Chapa public key for payment processing'),
  ('chapa_test_mode', '1', 'Enable test mode for Chapa payments (1 = enabled, 0 = disabled)'),
  ('chapa_webhook_enabled', '1', 'Enable webhook processing for Chapa payments (1 = enabled, 0 = disabled)')
ON CONFLICT (key) DO UPDATE SET
  description = EXCLUDED.description,
  updated_at = NOW();

-- Verify the settings were added
SELECT key, value, description FROM settings WHERE key LIKE 'chapa_%' ORDER BY key;
