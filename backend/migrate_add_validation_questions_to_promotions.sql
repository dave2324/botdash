-- Migration: Add validation_questions field to user_submitted_promotions table
-- Date: 2025-08-09
-- Description: Add JSONB field to store validation questions for user submitted promotions

-- Add validation_questions column to user_submitted_promotions table
ALTER TABLE user_submitted_promotions 
ADD COLUMN IF NOT EXISTS validation_questions JSONB DEFAULT NULL;

-- Update existing promotions to have NULL validation_questions (already the default)
-- No action needed as DEFAULT NULL is already set

-- Add comment for documentation
COMMENT ON COLUMN user_submitted_promotions.validation_questions IS 'JSON array of validation questions for user engagement verification';

-- Example structure:
-- [
--   {
--     "question": "What is the main topic of this video?",
--     "correct_answer": "Gaming tutorials",
--     "wrong_answers": ["Cooking", "Travel", "Music"]
--   }
-- ]
