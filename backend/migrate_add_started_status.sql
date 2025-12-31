-- Migration: Add 'started' status to affiliate_task_attempts table
-- This allows the new task flow: started -> pending -> approved/rejected

DO $$
BEGIN
  IF to_regclass('public.affiliate_task_attempts') IS NULL THEN
    RAISE NOTICE 'Skipping migrate_add_started_status.sql because affiliate_task_attempts does not exist';
    RETURN;
  END IF;

  -- Drop the existing check constraint
  EXECUTE 'ALTER TABLE affiliate_task_attempts DROP CONSTRAINT IF EXISTS affiliate_task_attempts_status_check';

  -- Add the new check constraint with ''started'' status included
  EXECUTE 'ALTER TABLE affiliate_task_attempts ADD CONSTRAINT affiliate_task_attempts_status_check CHECK (status IN (''started'', ''pending'', ''approved'', ''rejected'', ''completed''))';

  -- Update any existing NULL status values to ''started'' (just in case)
  EXECUTE 'UPDATE affiliate_task_attempts SET status = ''started'' WHERE status IS NULL';
END $$;