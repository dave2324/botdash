-- Migration script to add missing columns to the user_quiz_attempts table
-- This script should be run if you already have the table but need to add the new columns

-- Check if columns exist before adding them
DO $$
BEGIN
    -- Add correct_answers column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user_quiz_attempts' AND column_name='correct_answers') THEN
        ALTER TABLE user_quiz_attempts ADD COLUMN correct_answers INT NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added correct_answers column to user_quiz_attempts table';
    ELSE
        RAISE NOTICE 'correct_answers column already exists in user_quiz_attempts table';
    END IF;

    -- Add total_questions column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='user_quiz_attempts' AND column_name='total_questions') THEN
        ALTER TABLE user_quiz_attempts ADD COLUMN total_questions INT NOT NULL DEFAULT 0;
        RAISE NOTICE 'Added total_questions column to user_quiz_attempts table';
    ELSE
        RAISE NOTICE 'total_questions column already exists in user_quiz_attempts table';
    END IF;
END
$$; 