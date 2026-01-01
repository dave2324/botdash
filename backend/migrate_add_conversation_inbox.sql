-- Full conversation inbox (all user<->bot messages)

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES telegram_users(id) ON DELETE SET NULL,
  telegram_chat_id BIGINT NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMP,
  last_message_preview TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL, -- inbound | outbound
  telegram_message_id BIGINT,
  telegram_reply_to_message_id BIGINT,
  sender_telegram_user_id BIGINT,
  type VARCHAR(20) NOT NULL, -- text|photo|video|audio|voice|document|sticker|contact|location|unknown
  text TEXT,
  file_id TEXT,
  file_unique_id TEXT,
  file_name TEXT,
  mime_type TEXT,
  file_size INT,
  media_duration INT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_created_at ON conversation_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_conversation_messages_direction ON conversation_messages(direction);
