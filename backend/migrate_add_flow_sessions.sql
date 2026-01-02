-- Conversation Flow sessions (decision-tree state)
CREATE TABLE IF NOT EXISTS flow_sessions (
  id SERIAL PRIMARY KEY,
  telegram_chat_id TEXT NOT NULL UNIQUE,
  user_id BIGINT NULL REFERENCES telegram_users(id) ON DELETE SET NULL,
  flow_id TEXT NOT NULL,
  current_node_id TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flow_sessions_user_id ON flow_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_flow_id ON flow_sessions(flow_id);
