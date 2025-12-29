-- Create missing withdrawal system tables and functions
-- Date: 2025-08-28

-- Create withdrawals table if not exists
CREATE TABLE IF NOT EXISTS withdrawals (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES telegram_users(id),
    transaction_id VARCHAR(255) UNIQUE NOT NULL,
    points_deducted INTEGER NOT NULL,
    amount_etb DECIMAL(10, 2) NOT NULL,
    account_id INTEGER,
    account_number VARCHAR(255),
    account_type VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    chapa_transfer_id VARCHAR(255),
    chapa_response JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    failure_reason TEXT,
    CONSTRAINT valid_points CHECK (points_deducted > 0),
    CONSTRAINT valid_amount CHECK (amount_etb > 0)
);

-- Create deposits table if not exists
CREATE TABLE IF NOT EXISTS deposits (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES telegram_users(id),
    transaction_id VARCHAR(255) UNIQUE NOT NULL,
    points_received INTEGER NOT NULL,
    amount_etb DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'chapa',
    status VARCHAR(50) DEFAULT 'pending',
    chapa_checkout_url TEXT,
    chapa_reference VARCHAR(255),
    chapa_response JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    failed_at TIMESTAMP,
    failure_reason TEXT,
    CONSTRAINT valid_points CHECK (points_received > 0),
    CONSTRAINT valid_amount CHECK (amount_etb > 0)
);

-- Create user_withdrawal_accounts table if not exists
CREATE TABLE IF NOT EXISTS user_withdrawal_accounts (
    id SERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES telegram_users(id),
    account_type VARCHAR(100) NOT NULL,
    account_number VARCHAR(255) NOT NULL,
    account_name VARCHAR(255),
    is_verified BOOLEAN DEFAULT FALSE,
    is_default BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,
    UNIQUE(user_id, account_number, account_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposits_user_id ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_deposits_created_at ON deposits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_withdrawal_accounts_user_id ON user_withdrawal_accounts(user_id);

-- Create the check_withdrawal_eligibility function
CREATE OR REPLACE FUNCTION check_withdrawal_eligibility(
    p_user_id BIGINT,
    p_min_points INTEGER DEFAULT 1000
)
RETURNS TABLE(
    is_eligible BOOLEAN,
    reason TEXT,
    daily_limit_remaining DECIMAL,
    weekly_limit_remaining DECIMAL,
    monthly_limit_remaining DECIMAL
) AS $$
DECLARE
    v_user_points INTEGER;
    v_user_created_at TIMESTAMP;
    v_account_age_days INTEGER;
    v_tasks_completed INTEGER;
    v_min_account_age_days INTEGER;
    v_min_tasks_completed INTEGER;
    v_is_premium BOOLEAN;
    v_daily_limit DECIMAL;
    v_weekly_limit DECIMAL;
    v_monthly_limit DECIMAL;
    v_daily_total DECIMAL := 0;
    v_weekly_total DECIMAL := 0;
    v_monthly_total DECIMAL := 0;
    v_last_withdrawal TIMESTAMP;
    v_withdrawal_frequency TEXT;
BEGIN
    -- Get user details
    SELECT points, created_at, is_premium
    INTO v_user_points, v_user_created_at, v_is_premium
    FROM telegram_users
    WHERE id = p_user_id;
    
    -- Check if user exists
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 'User not found'::TEXT, 0::DECIMAL, 0::DECIMAL, 0::DECIMAL;
        RETURN;
    END IF;
    
    -- Get settings
    SELECT COALESCE(value::INTEGER, 7) INTO v_min_account_age_days
    FROM settings WHERE key = 'withdrawal_min_account_age_days';
    
    SELECT COALESCE(value::INTEGER, 10) INTO v_min_tasks_completed
    FROM settings WHERE key = 'withdrawal_min_tasks_completed';
    
    SELECT COALESCE(value::DECIMAL, 5000) INTO v_daily_limit
    FROM settings WHERE key = CASE 
        WHEN v_is_premium THEN 'premium_withdrawal_daily_limit'
        ELSE 'withdrawal_daily_limit'
    END;
    
    SELECT COALESCE(value::DECIMAL, 20000) INTO v_weekly_limit
    FROM settings WHERE key = 'withdrawal_weekly_limit';
    
    SELECT COALESCE(value::DECIMAL, 50000) INTO v_monthly_limit
    FROM settings WHERE key = 'withdrawal_monthly_limit';
    
    SELECT COALESCE(value::TEXT, 'daily') INTO v_withdrawal_frequency
    FROM settings WHERE key = CASE
        WHEN v_is_premium THEN 'premium_withdrawal_frequency'
        ELSE 'withdrawal_frequency'
    END;
    
    -- Calculate account age
    v_account_age_days := EXTRACT(DAY FROM NOW() - v_user_created_at)::INTEGER;
    
    -- Count completed tasks
    SELECT COUNT(*) INTO v_tasks_completed
    FROM task_progress
    WHERE user_id = p_user_id AND status = 'completed';
    
    -- Check points
    IF v_user_points < p_min_points THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Insufficient points. You need at least %s points.', p_min_points)::TEXT,
            v_daily_limit, 
            v_weekly_limit, 
            v_monthly_limit;
        RETURN;
    END IF;
    
    -- Check account age
    IF v_account_age_days < v_min_account_age_days THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Account must be at least %s days old. Your account is %s days old.', 
                   v_min_account_age_days, v_account_age_days)::TEXT,
            v_daily_limit, 
            v_weekly_limit, 
            v_monthly_limit;
        RETURN;
    END IF;
    
    -- Check tasks completed
    IF v_tasks_completed < v_min_tasks_completed THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('You must complete at least %s tasks. You have completed %s tasks.', 
                   v_min_tasks_completed, v_tasks_completed)::TEXT,
            v_daily_limit, 
            v_weekly_limit, 
            v_monthly_limit;
        RETURN;
    END IF;
    
    -- Get withdrawal totals for limits
    SELECT COALESCE(SUM(amount_etb), 0) INTO v_daily_total
    FROM withdrawals
    WHERE user_id = p_user_id 
    AND status IN ('completed', 'processing', 'pending')
    AND created_at >= CURRENT_DATE;
    
    SELECT COALESCE(SUM(amount_etb), 0) INTO v_weekly_total
    FROM withdrawals
    WHERE user_id = p_user_id 
    AND status IN ('completed', 'processing', 'pending')
    AND created_at >= CURRENT_DATE - INTERVAL '7 days';
    
    SELECT COALESCE(SUM(amount_etb), 0) INTO v_monthly_total
    FROM withdrawals
    WHERE user_id = p_user_id 
    AND status IN ('completed', 'processing', 'pending')
    AND created_at >= CURRENT_DATE - INTERVAL '30 days';
    
    -- Check frequency restrictions (unless premium with unlimited)
    IF v_withdrawal_frequency != 'unlimited' THEN
        SELECT created_at INTO v_last_withdrawal
        FROM withdrawals
        WHERE user_id = p_user_id 
        AND status IN ('completed', 'processing', 'pending')
        ORDER BY created_at DESC
        LIMIT 1;
        
        IF FOUND THEN
            IF v_withdrawal_frequency = 'daily' AND v_last_withdrawal >= CURRENT_DATE THEN
                RETURN QUERY SELECT 
                    FALSE, 
                    'You can only withdraw once per day. Please try again tomorrow.'::TEXT,
                    GREATEST(0, v_daily_limit - v_daily_total), 
                    GREATEST(0, v_weekly_limit - v_weekly_total), 
                    GREATEST(0, v_monthly_limit - v_monthly_total);
                RETURN;
            ELSIF v_withdrawal_frequency = 'weekly' AND v_last_withdrawal >= CURRENT_DATE - INTERVAL '7 days' THEN
                RETURN QUERY SELECT 
                    FALSE, 
                    'You can only withdraw once per week.'::TEXT,
                    GREATEST(0, v_daily_limit - v_daily_total), 
                    GREATEST(0, v_weekly_limit - v_weekly_total), 
                    GREATEST(0, v_monthly_limit - v_monthly_total);
                RETURN;
            ELSIF v_withdrawal_frequency = 'monthly' AND v_last_withdrawal >= CURRENT_DATE - INTERVAL '30 days' THEN
                RETURN QUERY SELECT 
                    FALSE, 
                    'You can only withdraw once per month.'::TEXT,
                    GREATEST(0, v_daily_limit - v_daily_total), 
                    GREATEST(0, v_weekly_limit - v_weekly_total), 
                    GREATEST(0, v_monthly_limit - v_monthly_total);
                RETURN;
            END IF;
        END IF;
    END IF;
    
    -- Check daily limit
    IF v_daily_total >= v_daily_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Daily withdrawal limit of %s ETB reached.', v_daily_limit)::TEXT,
            0::DECIMAL, 
            GREATEST(0, v_weekly_limit - v_weekly_total), 
            GREATEST(0, v_monthly_limit - v_monthly_total);
        RETURN;
    END IF;
    
    -- Check weekly limit
    IF v_weekly_total >= v_weekly_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Weekly withdrawal limit of %s ETB reached.', v_weekly_limit)::TEXT,
            GREATEST(0, v_daily_limit - v_daily_total), 
            0::DECIMAL, 
            GREATEST(0, v_monthly_limit - v_monthly_total);
        RETURN;
    END IF;
    
    -- Check monthly limit
    IF v_monthly_total >= v_monthly_limit THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Monthly withdrawal limit of %s ETB reached.', v_monthly_limit)::TEXT,
            GREATEST(0, v_daily_limit - v_daily_total), 
            GREATEST(0, v_weekly_limit - v_weekly_total), 
            0::DECIMAL;
        RETURN;
    END IF;
    
    -- All checks passed
    RETURN QUERY SELECT 
        TRUE, 
        'Eligible for withdrawal'::TEXT,
        GREATEST(0, v_daily_limit - v_daily_total), 
        GREATEST(0, v_weekly_limit - v_weekly_total), 
        GREATEST(0, v_monthly_limit - v_monthly_total);
END;
$$ LANGUAGE plpgsql;

-- Ensure default withdrawal settings exist with reasonable values
INSERT INTO settings (key, value, description)
VALUES 
    ('withdrawal_min_account_age_days', '7', 'Minimum account age in days required for withdrawal')
ON CONFLICT (key) 
DO UPDATE SET value = '7' 
WHERE settings.value::INTEGER > 30; -- Fix if it's set to an unreasonable value like 76

-- Add a comment explaining the function
COMMENT ON FUNCTION check_withdrawal_eligibility(BIGINT, INTEGER) IS 
'Checks if a user is eligible for withdrawal based on points, account age, tasks completed, and withdrawal limits';