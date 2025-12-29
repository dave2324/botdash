-- Performance optimization indexes for the GameMiniApp database
-- Run this to improve query performance

-- Indexes for spins table (most frequently queried)
CREATE INDEX IF NOT EXISTS idx_spins_user_date ON spins (user_id, created_at::date);
CREATE INDEX IF NOT EXISTS idx_spins_user_id_created ON spins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spins_created_date ON spins (created_at::date);

-- Indexes for task_progress table
CREATE INDEX IF NOT EXISTS idx_task_progress_user_task ON task_progress (user_id, task_type, task_id);
CREATE INDEX IF NOT EXISTS idx_task_progress_user_status ON task_progress (user_id, status);
CREATE INDEX IF NOT EXISTS idx_task_progress_status ON task_progress (status);

-- Indexes for telegram_users table
CREATE INDEX IF NOT EXISTS idx_telegram_users_referral_code ON telegram_users (referral_code);
CREATE INDEX IF NOT EXISTS idx_telegram_users_points ON telegram_users (points);
CREATE INDEX IF NOT EXISTS idx_telegram_users_last_active ON telegram_users (last_active);

-- Indexes for telegram_channels table
CREATE INDEX IF NOT EXISTS idx_telegram_channels_disabled ON telegram_channels (disabled);

-- Indexes for youtube_tasks table
CREATE INDEX IF NOT EXISTS idx_youtube_tasks_disabled_expires ON youtube_tasks (disabled, expires_at);

-- Indexes for quiz tables
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON quiz_questions (quiz_id);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user_quiz ON user_quiz_attempts (user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_user_quiz_attempts_user_completed ON user_quiz_attempts (user_id, completed_at DESC);

-- Indexes for spin_wheel_rewards table
CREATE INDEX IF NOT EXISTS idx_spin_wheel_rewards_active_position ON spin_wheel_rewards (is_active, position);

-- Indexes for settings table
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings (key);

-- Update table statistics for better query planning
ANALYZE telegram_users;
ANALYZE spins;
ANALYZE task_progress;
ANALYZE telegram_channels;
ANALYZE youtube_tasks;
ANALYZE quiz_questions;
ANALYZE user_quiz_attempts;
ANALYZE spin_wheel_rewards;
ANALYZE settings;

-- Add a comment for tracking
COMMENT ON INDEX idx_spins_user_date IS 'Optimizes daily spin count queries';
COMMENT ON INDEX idx_task_progress_user_task IS 'Optimizes task status lookups';
COMMENT ON INDEX idx_telegram_users_referral_code IS 'Optimizes referral code lookups';
