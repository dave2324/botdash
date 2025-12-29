-- Migration: Change settings.value column from INTEGER to TEXT
-- This allows storing both numeric and string settings values

-- Step 1: Update the column type
ALTER TABLE settings ALTER COLUMN value TYPE TEXT USING value::TEXT;

-- Step 2: Update the column comment
COMMENT ON COLUMN settings.value IS 'Setting value stored as text (can contain numeric or string values)';

-- Step 3: Verify the change
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'settings' AND column_name = 'value';
