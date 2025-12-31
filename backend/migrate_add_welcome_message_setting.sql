-- Add welcome_message setting for bot /start message
-- Supports variables like {first_name}, {points}, {referrer_name}

INSERT INTO settings (key, value, description)
VALUES (
  'welcome_message',
  '👋 Welcome, {first_name}!\n\nYour current points: {points}',
  'Message shown when user sends /start. Variables: {first_name}, {points}, {referrer_name}, {referrer_points}'
)
ON CONFLICT (key) DO NOTHING;
