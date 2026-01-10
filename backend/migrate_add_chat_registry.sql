-- Registry of chats the bot has seen (for easier configuration)

CREATE TABLE IF NOT EXISTS bot_chats (
  chat_id BIGINT PRIMARY KEY,
  chat_type TEXT NOT NULL,
  title TEXT NULL,
  username TEXT NULL,
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_chats_last_seen_at
  ON bot_chats(last_seen_at DESC);
