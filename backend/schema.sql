-- Drop tables if they exist (in reverse order to respect foreign key constraints)
DROP TABLE IF EXISTS spins;
DROP TABLE IF EXISTS user_tasks;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS referrals;
DROP TABLE IF EXISTS telegram_users;

-- Create users table
CREATE TABLE telegram_users (
  id BIGINT PRIMARY KEY,
  username VARCHAR(255),
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255),
  language_code VARCHAR(10) DEFAULT 'en',
  photo_url TEXT,
  points INT DEFAULT 0,
  is_banned BOOLEAN DEFAULT FALSE,
  is_premium BOOLEAN DEFAULT FALSE,
  premium_until TIMESTAMP,
  referral_code VARCHAR(20) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_active TIMESTAMP DEFAULT NOW()
);

-- Create index for username lookups
CREATE INDEX idx_telegram_users_username ON telegram_users(username);
-- Create index for referral code lookups
CREATE INDEX idx_telegram_users_referral_code ON telegram_users(referral_code);

-- Create referrals table
CREATE TABLE referrals (
  id SERIAL PRIMARY KEY,
  referrer_id BIGINT NOT NULL REFERENCES telegram_users(id),
  referred_id BIGINT NOT NULL REFERENCES telegram_users(id),
  points_awarded INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(referrer_id, referred_id)
);

-- Create index for referral lookups
CREATE INDEX idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred_id ON referrals(referred_id);

-- Create tasks table
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  points INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for task type lookups
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_is_active ON tasks(is_active);

-- Create user_tasks table (completed tasks)
CREATE TABLE user_tasks (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  task_id INT NOT NULL REFERENCES tasks(id),
  completed_at TIMESTAMP DEFAULT NOW(),
  points_awarded INT DEFAULT 0,
  UNIQUE(user_id, task_id)
);

-- Create index for user task lookups
CREATE INDEX idx_user_tasks_user_id ON user_tasks(user_id);
CREATE INDEX idx_user_tasks_task_id ON user_tasks(task_id);

-- Create spins table
CREATE TABLE spins (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  reward_id INT REFERENCES spin_wheel_rewards(id),
  result VARCHAR(255) NOT NULL,
  points_awarded INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for spin lookups
CREATE INDEX idx_spins_user_id ON spins(user_id);
CREATE INDEX idx_spins_created_at ON spins(created_at);

-- Create youtube_tasks table
CREATE TABLE IF NOT EXISTS youtube_tasks (
  id SERIAL PRIMARY KEY,
  youtube_url TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail TEXT,
  added_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP,
  disabled BOOLEAN DEFAULT FALSE,
  video_duration INT,
  require_finish_task_id INT,
  require_finish_task_type VARCHAR(50),
  promotion_id INT,
  require_premium BOOLEAN DEFAULT FALSE,
  vpn_countries TEXT[] DEFAULT '{}'
);

-- Create youtube_questions table for video validation
CREATE TABLE IF NOT EXISTS youtube_questions (
  id SERIAL PRIMARY KEY,
  youtube_task_id INT NOT NULL REFERENCES youtube_tasks(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  wrong_answers TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for youtube_questions lookups
CREATE INDEX idx_youtube_questions_task_id ON youtube_questions(youtube_task_id);

-- Create table for tracking user question responses
CREATE TABLE IF NOT EXISTS youtube_question_responses (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  question_id INT NOT NULL REFERENCES youtube_questions(id),
  answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index for youtube_question_responses lookups
CREATE INDEX idx_youtube_question_responses_user_id ON youtube_question_responses(user_id);
CREATE INDEX idx_youtube_question_responses_question_id ON youtube_question_responses(question_id);

-- Create telegram_channels table
CREATE TABLE IF NOT EXISTS telegram_channels (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  title VARCHAR(255),
  link TEXT NOT NULL,
  is_public BOOLEAN DEFAULT TRUE,
  is_private BOOLEAN DEFAULT FALSE,
  disabled BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  require_finish_task_id INT,
  require_finish_task_type VARCHAR(50),
  promotion_id INT,
  require_premium BOOLEAN DEFAULT FALSE
);

-- Create task_progress table
CREATE TABLE IF NOT EXISTS task_progress (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  task_type VARCHAR(50) NOT NULL,
  task_id INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  points_earned INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, task_type, task_id)
);

-- Create index for task progress lookups
CREATE INDEX idx_task_progress_user_id ON task_progress(user_id);
CREATE INDEX idx_task_progress_task_type ON task_progress(task_type);
CREATE INDEX idx_task_progress_status ON task_progress(status);

-- Create settings table for point configurations
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value, description) VALUES
  ('points_on_referral', '30', 'Points awarded for referring a new user'),
  ('points_on_math_quiz_single_answer', '10', 'Points awarded for each correct math quiz answer'),
  ('points_on_video_task_completion', '15', 'Points awarded for completing a video task'),
  ('points_on_channel_join', '20', 'Points awarded for joining a Telegram channel'),
  ('points_on_spin_wheel_play', '-5', 'Points deducted for playing spin wheel (negative for deduction)'),
  ('points_on_daily_login', '5', 'Points awarded for daily login'),
  ('points_on_quiz_perfect_score', '50', 'Bonus points for perfect quiz score'),
  ('points_on_first_task_completion', '25', 'Bonus points for completing first task of any type'),
  ('max_spin_wheel_plays_per_day', '5', 'Maximum number of times a user can spin the wheel per day'),
  ('max_math_quiz_plays_per_day', '10', 'Maximum number of times a user can play the automated math quiz per day'),
  ('premium_enabled', '1', 'Enable premium subscription feature (1 = enabled, 0 = disabled)'),
  ('premium_price', '299', 'Premium subscription price in cents'),
  ('premium_duration_days', '30', 'Premium subscription duration in days')
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description;

-- Create spin wheel rewards table
CREATE TABLE IF NOT EXISTS spin_wheel_rewards (
  id SERIAL PRIMARY KEY,
  label TEXT NOT NULL,
  points INTEGER NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#FFFFFF',
  probability DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  position INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default spin wheel rewards
INSERT INTO spin_wheel_rewards (label, points, color, probability, position) VALUES
  ('50 Points', 50, '#EE4040', 0.5, 0),
  ('10 Points', 10, '#F0CF50', 1.0, 1),
  ('30 Points', 30, '#815CD1', 0.7, 2),
  ('20 Points', 20, '#3DA5E0', 0.8, 3),
  ('40 Points', 40, '#34A24F', 0.6, 4),
  ('Try Again', 0, '#F9AA1F', 1.0, 5),
  ('25 Points', 25, '#EC3F3F', 0.75, 6),
  ('15 Points', 15, '#FF9000', 0.9, 7)
ON CONFLICT DO NOTHING;

-- Create quizzes table
CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  hashtags TEXT[] DEFAULT '{}',
  points_per_question INT DEFAULT 10,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  require_finish_task_id INT,
  require_finish_task_type VARCHAR(50)
);

-- Create quiz questions table with answers included
CREATE TABLE IF NOT EXISTS quiz_questions (
  id SERIAL PRIMARY KEY,
  quiz_id INT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  wrong_answers TEXT[] NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for quiz lookups
CREATE INDEX idx_quiz_questions_quiz_id ON quiz_questions(quiz_id);
CREATE INDEX idx_quizzes_is_active ON quizzes(is_active);

-- Create user quiz attempts table
CREATE TABLE IF NOT EXISTS user_quiz_attempts (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  quiz_id INT NOT NULL REFERENCES quizzes(id),
  score INT NOT NULL DEFAULT 0,
  correct_answers INT NOT NULL DEFAULT 0,
  total_questions INT NOT NULL DEFAULT 0,
  completed_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, quiz_id)
);

-- Create index for quiz attempt lookups
CREATE INDEX idx_user_quiz_attempts_user_id ON user_quiz_attempts(user_id);
CREATE INDEX idx_user_quiz_attempts_quiz_id ON user_quiz_attempts(quiz_id);

-- Insert default tasks
INSERT INTO tasks (type, description, points)
VALUES 
  ('video', 'Watch a promotional video', 10),
  ('quiz', 'Complete the daily quiz', 20),
  ('channel', 'Join our Telegram channel', 30)
ON CONFLICT DO NOTHING;

-- Create view for user statistics
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
  u.id,
  u.username,
  u.first_name,
  u.last_name,
  u.photo_url,
  u.points,
  COUNT(DISTINCT r.id) AS referral_count,
  COUNT(DISTINCT ut.id) AS completed_tasks_count,
  COUNT(DISTINCT s.id) AS spins_count
FROM telegram_users u
LEFT JOIN referrals r ON u.id = r.referrer_id
LEFT JOIN user_tasks ut ON u.id = ut.user_id
LEFT JOIN spins s ON u.id = s.user_id
GROUP BY u.id, u.username, u.first_name, u.last_name, u.photo_url, u.points;

-- Create a function to add points to a user
CREATE OR REPLACE FUNCTION add_points_to_user(
  user_id_param BIGINT,
  points_to_add INT
) RETURNS INT AS $$
DECLARE
  new_points INT;
BEGIN
  UPDATE telegram_users
  SET points = points + points_to_add
  WHERE id = user_id_param
  RETURNING points INTO new_points;
  
  RETURN new_points;
END;
$$ LANGUAGE plpgsql;

-- Create a function to check daily tasks status
CREATE OR REPLACE FUNCTION get_daily_task_status(
  user_id_param BIGINT
) RETURNS TABLE (
  task_id INT,
  task_type VARCHAR(50),
  task_description TEXT,
  task_points INT,
  is_completed BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id AS task_id,
    t.type AS task_type,
    t.description AS task_description,
    t.points AS task_points,
    CASE WHEN ut.id IS NOT NULL AND ut.completed_at::date = CURRENT_DATE THEN TRUE ELSE FALSE END AS is_completed
  FROM tasks t
  LEFT JOIN user_tasks ut ON t.id = ut.task_id AND ut.user_id = user_id_param AND ut.completed_at::date = CURRENT_DATE
  WHERE t.is_active = TRUE;
END;
$$ LANGUAGE plpgsql; 

-- Create user_submitted_promotions table
CREATE TABLE IF NOT EXISTS user_submitted_promotions (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('channel_join', 'video_boost')),
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  target_url TEXT NOT NULL,
  target_views_joins INTEGER NOT NULL,
  budget_points INTEGER,
  budget_cash DECIMAL(10,2),
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'active', 'completed', 'expired')),
  admin_notes TEXT,
  current_views_joins INTEGER DEFAULT 0,
  validation_questions JSONB DEFAULT NULL,
  require_premium BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  declined_at TIMESTAMP,
  activated_at TIMESTAMP
);

-- Create index for user submitted promotions lookups
CREATE INDEX idx_user_submitted_promotions_user_id ON user_submitted_promotions(user_id);
CREATE INDEX idx_user_submitted_promotions_status ON user_submitted_promotions(status);
CREATE INDEX idx_user_submitted_promotions_type ON user_submitted_promotions(type);
CREATE INDEX idx_user_submitted_promotions_created_at ON user_submitted_promotions(created_at);

-- Create user_promotion_engagements table to track user interactions
CREATE TABLE IF NOT EXISTS user_promotion_engagements (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  promotion_id INTEGER NOT NULL REFERENCES user_submitted_promotions(id) ON DELETE CASCADE,
  engagement_type VARCHAR(20) NOT NULL CHECK (engagement_type IN ('view', 'join')),
  points_awarded INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, promotion_id, engagement_type)
);

-- Create index for user promotion engagements lookups
CREATE INDEX idx_user_promotion_engagements_user_id ON user_promotion_engagements(user_id);
CREATE INDEX idx_user_promotion_engagements_promotion_id ON user_promotion_engagements(promotion_id);
CREATE INDEX idx_user_promotion_engagements_type ON user_promotion_engagements(engagement_type);

-- Migration: Add is_banned column to telegram_users
-- Migration: Change completed_user_ids in youtube_tasks from INTEGER[] to BIGINT[]
-- If you have existing data, run this after deployment:
-- ALTER TABLE youtube_tasks ALTER COLUMN completed_user_ids TYPE BIGINT[] USING completed_user_ids::BIGINT[];
