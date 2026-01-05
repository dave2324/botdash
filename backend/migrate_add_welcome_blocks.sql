-- Welcome blocks (ordered welcome sequence for /start)

CREATE TABLE IF NOT EXISTS welcome_blocks (
  id SERIAL PRIMARY KEY,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  block_type VARCHAR(30) NOT NULL, -- 'text' | 'link' | 'image' | 'video' | 'question_flow'
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_welcome_blocks_active_sort
  ON welcome_blocks(is_active, sort_order, id);
