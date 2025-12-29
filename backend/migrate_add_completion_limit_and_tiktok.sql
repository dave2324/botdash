-- Add completion_limit field to youtube_tasks table
ALTER TABLE youtube_tasks
ADD COLUMN IF NOT EXISTS completion_limit INTEGER DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN youtube_tasks.completion_limit IS 'Maximum number of completions allowed before task is disabled for new users';

-- Create index for efficient completion limit checking
CREATE INDEX IF NOT EXISTS idx_youtube_tasks_completion_limit ON youtube_tasks(completion_limit) WHERE completion_limit IS NOT NULL;

-- Update existing tasks to have unlimited completions (NULL means no limit)
-- No action needed as DEFAULT NULL handles this