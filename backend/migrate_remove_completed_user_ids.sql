-- Migration: Remove completed_user_ids column from youtube_tasks table
-- This column is no longer needed as we use task_progress table for tracking completion

-- Drop the completed_user_ids column
ALTER TABLE youtube_tasks 
DROP COLUMN IF EXISTS completed_user_ids;
