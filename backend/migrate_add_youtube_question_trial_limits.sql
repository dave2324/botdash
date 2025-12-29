-- Migration to add support for trial limits and short answer questions in YouTube tasks
-- Add question_type column (multiple_choice, short_answer)
ALTER TABLE youtube_questions 
ADD COLUMN IF NOT EXISTS question_type VARCHAR(20) NOT NULL DEFAULT 'multiple_choice';

-- Add max_attempts column (for limiting trial attempts)
ALTER TABLE youtube_questions
ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3;

-- Add cooldown_seconds column (for cooldown after reaching max attempts)
ALTER TABLE youtube_questions
ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER NOT NULL DEFAULT 300;

-- Update youtube_question_responses to track attempts
ALTER TABLE youtube_question_responses
ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

-- Add cooldown_until column to track when the cooldown expires
ALTER TABLE youtube_question_responses
ADD COLUMN IF NOT EXISTS cooldown_until TIMESTAMP;

COMMENT ON COLUMN youtube_questions.question_type IS 'Type of question: multiple_choice or short_answer';
COMMENT ON COLUMN youtube_questions.max_attempts IS 'Maximum number of attempts allowed before cooldown';
COMMENT ON COLUMN youtube_questions.cooldown_seconds IS 'Cooldown period in seconds after max attempts are reached';
COMMENT ON COLUMN youtube_question_responses.attempt_number IS 'Which attempt number this response represents';
COMMENT ON COLUMN youtube_question_responses.cooldown_until IS 'Timestamp when cooldown expires, if max attempts reached';

-- Update the default settings
INSERT INTO settings (key, value, description) VALUES
  ('default_question_max_attempts', '3', 'Default maximum attempts for YouTube questions before cooldown'),
  ('default_question_cooldown_seconds', '300', 'Default cooldown time in seconds after reaching maximum attempts')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;