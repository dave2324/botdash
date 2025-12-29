-- Add premium-related fields to telegram_users table if they don't exist
ALTER TABLE telegram_users 
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS premium_until TIMESTAMP,
  ADD COLUMN IF NOT EXISTS premium_subscription_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS premium_payment_reference VARCHAR(100);

-- Create premium payments table to track transactions
CREATE TABLE IF NOT EXISTS premium_payments (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'ETB',
  payment_reference VARCHAR(100),
  provider VARCHAR(20) NOT NULL,
  provider_tx_id VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  payment_method VARCHAR(50),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add index for premium payments lookups
CREATE INDEX IF NOT EXISTS idx_premium_payments_user_id ON premium_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_premium_payments_status ON premium_payments(status);
CREATE INDEX IF NOT EXISTS idx_premium_payments_reference ON premium_payments(payment_reference);

-- Add index for premium users
CREATE INDEX IF NOT EXISTS idx_telegram_users_is_premium ON telegram_users(is_premium);
CREATE INDEX IF NOT EXISTS idx_telegram_users_premium_until ON telegram_users(premium_until);
