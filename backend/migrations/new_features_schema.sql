-- New Features Database Schema
-- Affiliate Tasks (CPL & CPA)
CREATE TABLE IF NOT EXISTS affiliate_tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    affiliate_type VARCHAR(50) NOT NULL CHECK (affiliate_type IN ('CPL', 'CPA')),
    affiliate_link TEXT NOT NULL,
    instructions TEXT,
    target_country VARCHAR(100),
    verification_method VARCHAR(50) NOT NULL CHECK (verification_method IN ('manual', 'automatic')),
    reward_type VARCHAR(20) NOT NULL CHECK (reward_type IN ('points', 'cash')),
    reward_amount DECIMAL(10,2) NOT NULL,
    completion_limit INTEGER DEFAULT NULL,
    per_user_limit INTEGER DEFAULT 1,
    expiry_date TIMESTAMP DEFAULT NULL,
    proof_requirement VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    require_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES telegram_users(id)
);

CREATE TABLE IF NOT EXISTS affiliate_task_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telegram_users(id),
    task_id INTEGER NOT NULL REFERENCES affiliate_tasks(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
    proof_url TEXT,
    proof_text TEXT,
    ip_address INET,
    device_id VARCHAR(255),
    conversion_id VARCHAR(255),
    admin_notes TEXT,
    points_awarded INTEGER DEFAULT 0,
    cash_awarded DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP DEFAULT NULL,
    reviewed_by INTEGER REFERENCES telegram_users(id),
    UNIQUE(user_id, task_id)
);

-- Short Courses System
CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced')),
    price DECIMAL(10,2) DEFAULT 0,
    duration_hours INTEGER,
    is_free BOOLEAN DEFAULT true,
    require_premium BOOLEAN DEFAULT false,
    unlock_criteria JSONB DEFAULT '{}',
    certification_required BOOLEAN DEFAULT false,
    certificate_template TEXT,
    thumbnail_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES telegram_users(id)
);

CREATE TABLE IF NOT EXISTS course_lessons (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('video', 'text', 'pdf', 'quiz')),
    content_url TEXT,
    content_text TEXT,
    order_index INTEGER NOT NULL,
    duration_minutes INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS course_quizzes (
    id SERIAL PRIMARY KEY,
    lesson_id INTEGER NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    correct_answer TEXT NOT NULL,
    wrong_answers JSONB DEFAULT '[]',
    points INTEGER DEFAULT 1,
    order_index INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_course_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telegram_users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id INTEGER REFERENCES course_lessons(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'completed')),
    progress_percentage INTEGER DEFAULT 0,
    quiz_score INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP DEFAULT NULL,
    UNIQUE(user_id, course_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS user_certificates (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telegram_users(id),
    course_id INTEGER NOT NULL REFERENCES courses(id),
    certificate_id VARCHAR(100) UNIQUE NOT NULL,
    certificate_url TEXT,
    issued_at TIMESTAMP DEFAULT NOW(),
    verification_code VARCHAR(50) UNIQUE NOT NULL,
    is_valid BOOLEAN DEFAULT true
);

-- Role Management System
CREATE TABLE IF NOT EXISTS admin_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    permissions JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id INTEGER NOT NULL REFERENCES admin_roles(id),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    created_by INTEGER REFERENCES admin_users(id)
);

CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES admin_users(id),
    action VARCHAR(255) NOT NULL,
    target_type VARCHAR(100),
    target_id INTEGER,
    details JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Daily Check-in System
CREATE TABLE IF NOT EXISTS daily_checkins (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES telegram_users(id),
    check_in_date DATE NOT NULL,
    streak_count INTEGER NOT NULL DEFAULT 1,
    points_awarded INTEGER DEFAULT 0,
    milestone_reached INTEGER DEFAULT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, check_in_date)
);

CREATE TABLE IF NOT EXISTS checkin_settings (
    id SERIAL PRIMARY KEY,
    day_number INTEGER NOT NULL UNIQUE,
    points_reward INTEGER NOT NULL DEFAULT 10,
    is_milestone BOOLEAN DEFAULT false,
    milestone_bonus INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Local Advertising System
CREATE TABLE IF NOT EXISTS local_ads (
    id SERIAL PRIMARY KEY,
    advertiser_name VARCHAR(255) NOT NULL,
    advertiser_email VARCHAR(255),
    advertiser_phone VARCHAR(50),
    ad_type VARCHAR(20) NOT NULL CHECK (ad_type IN ('banner', 'video')),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    image_url TEXT,
    video_url TEXT,
    destination_url TEXT,
    display_duration_days INTEGER DEFAULT 7,
    target_placement VARCHAR(100),
    payment_type VARCHAR(20) NOT NULL CHECK (payment_type IN ('CPC', 'CPM', 'flat')),
    payment_amount DECIMAL(10,2) NOT NULL,
    budget_limit DECIMAL(10,2),
    start_date TIMESTAMP DEFAULT NOW(),
    end_date TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'active', 'paused', 'expired', 'rejected')),
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    total_spent DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    reviewed_by INTEGER REFERENCES admin_users(id)
);

CREATE TABLE IF NOT EXISTS ad_impressions (
    id SERIAL PRIMARY KEY,
    ad_id INTEGER NOT NULL REFERENCES local_ads(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES telegram_users(id),
    ip_address INET,
    user_agent TEXT,
    placement VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_clicks (
    id SERIAL PRIMARY KEY,
    ad_id INTEGER NOT NULL REFERENCES local_ads(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES telegram_users(id),
    ip_address INET,
    user_agent TEXT,
    placement VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Payment Gateway Settings
CREATE TABLE IF NOT EXISTS payment_gateways (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT false,
    api_key TEXT,
    secret_key TEXT,
    webhook_url TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced Transaction Logs (if not exists)
CREATE TABLE IF NOT EXISTS enhanced_transaction_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telegram_users(id),
    transaction_type VARCHAR(50) NOT NULL,
    transaction_id VARCHAR(255),
    amount DECIMAL(10,2) NOT NULL,
    balance_before DECIMAL(10,2) NOT NULL,
    balance_after DECIMAL(10,2) NOT NULL,
    description TEXT,
    reference_type VARCHAR(50),
    reference_id INTEGER,
    gateway VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    admin_user_id INTEGER REFERENCES admin_users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Leaderboard Views
CREATE TABLE IF NOT EXISTS leaderboard_settings (
    id SERIAL PRIMARY KEY,
    leaderboard_type VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    refresh_interval_hours INTEGER DEFAULT 24,
    display_count INTEGER DEFAULT 10,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User Statistics for Leaderboard (materialized view alternative)
CREATE TABLE IF NOT EXISTS user_leaderboard_stats (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES telegram_users(id),
    total_earnings DECIMAL(10,2) DEFAULT 0,
    completed_tasks INTEGER DEFAULT 0,
    checkin_streak INTEGER DEFAULT 0,
    affiliate_completions INTEGER DEFAULT 0,
    course_completions INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Insert default admin role
INSERT INTO admin_roles (name, description, permissions) VALUES 
('superadmin', 'Full system access', '{"all": true}'),
('admin', 'Limited admin access', '{"tasks": true, "users": true, "moderate": true}'),
('staff', 'Basic moderation access', '{"moderate": true, "view": true}')
ON CONFLICT (name) DO NOTHING;

-- Insert default checkin settings (30 days)
INSERT INTO checkin_settings (day_number, points_reward, is_milestone, milestone_bonus) VALUES 
(1, 10, false, 0), (2, 15, false, 0), (3, 20, false, 0), (4, 25, false, 0), (5, 30, false, 0),
(6, 35, false, 0), (7, 50, true, 100), (8, 40, false, 0), (9, 45, false, 0), (10, 50, false, 0),
(11, 55, false, 0), (12, 60, false, 0), (13, 65, false, 0), (14, 100, true, 200), 
(15, 70, false, 0), (16, 75, false, 0), (17, 80, false, 0), (18, 85, false, 0), (19, 90, false, 0),
(20, 95, false, 0), (21, 150, true, 300), (22, 100, false, 0), (23, 105, false, 0), (24, 110, false, 0),
(25, 115, false, 0), (26, 120, false, 0), (27, 125, false, 0), (28, 200, true, 500), 
(29, 130, false, 0), (30, 300, true, 1000)
ON CONFLICT (day_number) DO NOTHING;

-- Insert default payment gateways
INSERT INTO payment_gateways (name, is_active, settings) VALUES 
('chapa', true, '{"currency": "ETB", "test_mode": true}'),
('santimpay', false, '{"currency": "ETB", "test_mode": true}')
ON CONFLICT (name) DO NOTHING;

-- Insert default leaderboard settings
INSERT INTO leaderboard_settings (leaderboard_type, is_active, refresh_interval_hours, display_count) VALUES 
('earnings', true, 24, 10),
('tasks', true, 24, 10),
('checkins', true, 24, 10),
('affiliates', true, 24, 10)
ON CONFLICT (leaderboard_type) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_affiliate_task_attempts_user_task ON affiliate_task_attempts(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_task_attempts_status ON affiliate_task_attempts(status);
CREATE INDEX IF NOT EXISTS idx_course_progress_user_course ON user_course_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_course_progress_status ON user_course_progress(status);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, check_in_date);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_streak ON daily_checkins(streak_count);
CREATE INDEX IF NOT EXISTS idx_local_ads_status ON local_ads(status);
CREATE INDEX IF NOT EXISTS idx_local_ads_active ON local_ads(is_active);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_user ON admin_activity_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_transaction_logs_user ON enhanced_transaction_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_transaction_logs_type ON enhanced_transaction_logs(transaction_type);