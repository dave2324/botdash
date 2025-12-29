-- Fix affiliate_task_attempts user_id column to match telegram_users.id type
-- This fixes the "value is out of range for type integer" error

-- First, check if we need to drop the foreign key constraint
DO $$ 
BEGIN
    -- Drop foreign key constraint if it exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'affiliate_task_attempts_user_id_fkey'
        AND table_name = 'affiliate_task_attempts'
    ) THEN
        ALTER TABLE affiliate_task_attempts DROP CONSTRAINT affiliate_task_attempts_user_id_fkey;
    END IF;
END $$;

-- Change user_id from INTEGER to BIGINT
ALTER TABLE affiliate_task_attempts ALTER COLUMN user_id TYPE BIGINT;

-- Recreate the foreign key constraint
ALTER TABLE affiliate_task_attempts 
ADD CONSTRAINT affiliate_task_attempts_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES telegram_users(id);

-- Update any other tables that might have the same issue
-- Check and fix other tables if they exist

-- Fix courses table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'courses' AND column_name = 'user_id' AND data_type = 'integer') THEN
        -- Drop constraint if exists
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'courses_user_id_fkey' AND table_name = 'courses') THEN
            ALTER TABLE courses DROP CONSTRAINT courses_user_id_fkey;
        END IF;
        -- Change data type
        ALTER TABLE courses ALTER COLUMN user_id TYPE BIGINT;
        -- Recreate constraint
        ALTER TABLE courses ADD CONSTRAINT courses_user_id_fkey FOREIGN KEY (user_id) REFERENCES telegram_users(id);
    END IF;
END $$;

-- Fix checkins table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'checkins' AND column_name = 'user_id' AND data_type = 'integer') THEN
        -- Drop constraint if exists
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'checkins_user_id_fkey' AND table_name = 'checkins') THEN
            ALTER TABLE checkins DROP CONSTRAINT checkins_user_id_fkey;
        END IF;
        -- Change data type
        ALTER TABLE checkins ALTER COLUMN user_id TYPE BIGINT;
        -- Recreate constraint
        ALTER TABLE checkins ADD CONSTRAINT checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES telegram_users(id);
    END IF;
END $$;

-- Fix ads_interactions table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ads_interactions' AND column_name = 'user_id' AND data_type = 'integer') THEN
        -- Drop constraint if exists
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ads_interactions_user_id_fkey' AND table_name = 'ads_interactions') THEN
            ALTER TABLE ads_interactions DROP CONSTRAINT ads_interactions_user_id_fkey;
        END IF;
        -- Change data type
        ALTER TABLE ads_interactions ALTER COLUMN user_id TYPE BIGINT;
        -- Recreate constraint
        ALTER TABLE ads_interactions ADD CONSTRAINT ads_interactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES telegram_users(id);
    END IF;
END $$;

-- Fix leaderboard table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'leaderboard' AND column_name = 'user_id' AND data_type = 'integer') THEN
        -- Drop constraint if exists
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'leaderboard_user_id_fkey' AND table_name = 'leaderboard') THEN
            ALTER TABLE leaderboard DROP CONSTRAINT leaderboard_user_id_fkey;
        END IF;
        -- Change data type
        ALTER TABLE leaderboard ALTER COLUMN user_id TYPE BIGINT;
        -- Recreate constraint
        ALTER TABLE leaderboard ADD CONSTRAINT leaderboard_user_id_fkey FOREIGN KEY (user_id) REFERENCES telegram_users(id);
    END IF;
END $$;

-- Fix withdrawal_feed table if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'withdrawal_feed' AND column_name = 'user_id' AND data_type = 'integer') THEN
        -- Drop constraint if exists
        IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'withdrawal_feed_user_id_fkey' AND table_name = 'withdrawal_feed') THEN
            ALTER TABLE withdrawal_feed DROP CONSTRAINT withdrawal_feed_user_id_fkey;
        END IF;
        -- Change data type
        ALTER TABLE withdrawal_feed ALTER COLUMN user_id TYPE BIGINT;
        -- Recreate constraint
        ALTER TABLE withdrawal_feed ADD CONSTRAINT withdrawal_feed_user_id_fkey FOREIGN KEY (user_id) REFERENCES telegram_users(id);
    END IF;
END $$;

COMMIT;