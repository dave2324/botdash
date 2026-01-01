-- Adds onboarding questions + user answers + i18n settings keys

-- 1) Onboarding questions definition
CREATE TABLE IF NOT EXISTS onboarding_questions (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  trigger VARCHAR(32) NOT NULL DEFAULT 'on_start' CHECK (trigger IN ('on_start')),
  question_translations JSONB NOT NULL DEFAULT '{}'::jsonb,
  type VARCHAR(32) NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'single_choice')),
  options_translations JSONB DEFAULT NULL,
  required BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_questions_active_sort
  ON onboarding_questions(is_active, sort_order);

-- 2) User answers
CREATE TABLE IF NOT EXISTS onboarding_answers (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES onboarding_questions(id) ON DELETE CASCADE,
  answer_text TEXT,
  answer_option_key VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_answers_user_id
  ON onboarding_answers(user_id);

-- 3) Track user onboarding progress (optional but helps resume)
ALTER TABLE telegram_users
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE;

-- 4) Seed settings keys for i18n templates (value stored as TEXT)
-- NOTE: value column is TEXT in this project; we store JSON as string.
INSERT INTO settings (key, value, description)
SELECT 'supported_languages', '[{"code":"en","label":"English"}]', 'Supported languages for bot UI (JSON array)'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'supported_languages');

INSERT INTO settings (key, value, description)
SELECT 'default_language', 'en', 'Default language code used when user has no language_code set'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'default_language');

-- Welcome templates per language
INSERT INTO settings (key, value, description)
SELECT 'welcome_templates', '{"en":{"text":"","image_url":""}}', 'Welcome message templates by language (JSON: {lang:{text,image_url}})'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'welcome_templates');

-- Optional: broadcast defaults
INSERT INTO settings (key, value, description)
SELECT 'broadcast_default_parse_mode', 'HTML', 'Parse mode for broadcast messages (HTML/Markdown)'
WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'broadcast_default_parse_mode');
