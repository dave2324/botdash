-- Add plain welcome settings (no variables/templates)

INSERT INTO settings (key, value, description)
SELECT 'welcome_text', '', 'Plain welcome message text (no variables)'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'welcome_text');

-- welcome_image_url already exists in some deployments; only insert if missing
INSERT INTO settings (key, value, description)
SELECT 'welcome_image_url', '', 'Welcome image URL or Telegram file_id'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'welcome_image_url');

INSERT INTO settings (key, value, description)
SELECT 'welcome_video_url', '', 'Welcome video URL or Telegram file_id'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'welcome_video_url');
