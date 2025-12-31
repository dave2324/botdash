-- Migration: Change settings.value column from INTEGER to TEXT
-- This allows storing both numeric and string settings values

-- Ensure settings table exists (some older databases may not have it)
CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Step 1: Update the column type
ALTER TABLE settings ALTER COLUMN value TYPE TEXT USING value::TEXT;

-- Step 2: Update the column comment
COMMENT ON COLUMN settings.value IS 'Setting value stored as text (can contain numeric or string values)';

-- Step 3: Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'settings' AND column_name = 'value';
