-- Migration: Fix enhanced_transaction_logs user_id column to handle large Telegram user IDs
-- Change from INTEGER to BIGINT to support large user IDs

-- Drop the foreign key constraint first
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'enhanced_transaction_logs_user_id_fkey'
        AND table_name = 'enhanced_transaction_logs'
    ) THEN
        ALTER TABLE enhanced_transaction_logs DROP CONSTRAINT enhanced_transaction_logs_user_id_fkey;
    END IF;
END $$;

-- Change the column type from INTEGER to BIGINT
ALTER TABLE enhanced_transaction_logs ALTER COLUMN user_id TYPE BIGINT;

-- Re-add the foreign key constraint
ALTER TABLE enhanced_transaction_logs
ADD CONSTRAINT enhanced_transaction_logs_user_id_fkey
FOREIGN KEY (user_id) REFERENCES telegram_users(id);