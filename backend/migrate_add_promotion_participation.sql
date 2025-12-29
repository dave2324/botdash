-- Migration to add tables for the new Promotion Task Participation feature

-- Create promotion products table (products that users can promote)
CREATE TABLE IF NOT EXISTS promotion_products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create promotion pricing tiers table (pricing for different view/engagement levels)
CREATE TABLE IF NOT EXISTS promotion_pricing_tiers (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES promotion_products(id) ON DELETE CASCADE,
  view_count INTEGER NOT NULL, -- e.g., 1000, 5000, 10000
  points_reward INTEGER, -- reward in points
  cash_reward DECIMAL(10,2), -- reward in ETB
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create content promotion submissions table (user submissions for review)
CREATE TABLE IF NOT EXISTS promotion_submissions (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES telegram_users(id),
  product_id INTEGER NOT NULL REFERENCES promotion_products(id),
  platform VARCHAR(50) NOT NULL, -- youtube, tiktok, instagram, etc.
  content_url TEXT NOT NULL, -- URL to the promoted content
  claimed_views INTEGER NOT NULL, -- views claimed by user
  claimed_likes INTEGER, -- likes claimed by user
  claimed_comments INTEGER, -- comments claimed by user
  proof_url TEXT, -- URL to screenshot or analytics
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_notes TEXT,
  points_awarded INTEGER,
  cash_awarded DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by BIGINT,
  UNIQUE(user_id, content_url) -- Prevent duplicate submissions for same content
);

-- Create indexes for performance
CREATE INDEX idx_promotion_products_is_active ON promotion_products(is_active);
CREATE INDEX idx_promotion_pricing_tiers_product_id ON promotion_pricing_tiers(product_id);
CREATE INDEX idx_promotion_submissions_user_id ON promotion_submissions(user_id);
CREATE INDEX idx_promotion_submissions_status ON promotion_submissions(status);
CREATE INDEX idx_promotion_submissions_product_id ON promotion_submissions(product_id);

-- Add blacklisting ability to user accounts
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS promotion_blacklisted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS promotion_blacklisted_reason TEXT;
