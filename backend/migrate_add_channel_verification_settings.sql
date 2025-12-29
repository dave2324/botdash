-- Add channel verification frequency setting
INSERT INTO settings (key, value, description)
VALUES (
  'channel_verification_frequency_hours', 
  '24', 
  'How often to check if users have left channels (in hours)'
)
ON CONFLICT (key) DO UPDATE
SET value = '24', updated_at = NOW();