-- Migration: Add category to quizzes and set all existing quizzes to 'Math'

ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS category VARCHAR(100) DEFAULT 'Math';

-- Update all existing quizzes to have category 'Math'
UPDATE quizzes SET category = 'Math' WHERE category IS NULL OR category = '';

-- Optionally, add index for category lookups
CREATE INDEX IF NOT EXISTS idx_quizzes_category ON quizzes(category);
