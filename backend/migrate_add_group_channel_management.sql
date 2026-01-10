-- Group/Channel management settings and scheduled posts

CREATE TABLE IF NOT EXISTS chat_moderation_settings (
  chat_id BIGINT PRIMARY KEY,
  chat_type TEXT NOT NULL, -- group | supergroup | channel
  enabled BOOLEAN NOT NULL DEFAULT TRUE,

  welcome_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  welcome_text TEXT NULL,

  delete_links_enabled BOOLEAN NOT NULL DEFAULT FALSE,

  auto_mute_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_mute_seconds INT NOT NULL DEFAULT 3600,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_moderation_settings_enabled
  ON chat_moderation_settings(enabled);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL,
  chat_type TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text', -- text | photo | video
  text TEXT NULL,
  media_url TEXT NULL,
  send_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed
  error TEXT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_posts_due
  ON scheduled_posts(status, send_at);
