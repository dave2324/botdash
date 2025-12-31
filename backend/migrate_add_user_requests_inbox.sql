-- Admin inbox for user requests/support

CREATE TABLE IF NOT EXISTS user_requests (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  telegram_chat_id BIGINT NOT NULL,
  source VARCHAR(30) NOT NULL, -- 'callback_query' | 'command'
  action_key TEXT,            -- e.g. callback_data or command name
  message TEXT,               -- human readable description
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open | in_progress | closed
  admin_reply TEXT,
  replied_by_admin_id INT,
  replied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_requests_user_id ON user_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_user_requests_status ON user_requests(status);
CREATE INDEX IF NOT EXISTS idx_user_requests_created_at ON user_requests(created_at);
