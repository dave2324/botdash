-- Migration: Add 'started' status to affiliate_task_attempts table
-- This allows the new task flow: started -> pending -> approved/rejected

-- Drop the existing check constraint
ALTER TABLE affiliate_task_attempts DROP CONSTRAINT IF EXISTS affiliate_task_attempts_status_check;

-- Add the new check constraint with 'started' status included
ALTER TABLE affiliate_task_attempts ADD CONSTRAINT affiliate_task_attempts_status_check
    CHECK (status IN ('started', 'pending', 'approved', 'rejected', 'completed'));

-- Update any existing NULL status values to 'started' (just in case)
UPDATE affiliate_task_attempts SET status = 'started' WHERE status IS NULL;