-- Migration: Add Chapa integration columns to deposits table
-- Date: 2025-08-20

-- Add Chapa-specific columns to deposits table if they don't exist
ALTER TABLE deposits 
ADD COLUMN IF NOT EXISTS chapa_checkout_url TEXT,
ADD COLUMN IF NOT EXISTS chapa_reference TEXT,
ADD COLUMN IF NOT EXISTS chapa_response JSONB;

-- Add Chapa settings to the settings table
INSERT INTO settings (key, value, description, created_at, updated_at)
VALUES 
  ('chapa_api_key', '', 'Chapa API Key', NOW(), NOW()),
  ('chapa_test_mode', '1', 'Enable Chapa test mode (1=test, 0=live)', NOW(), NOW()),
  ('chapa_webhook_enabled', '1', 'Enable Chapa webhook processing', NOW(), NOW())
ON CONFLICT (key) DO UPDATE 
SET updated_at = NOW();

-- Create index for faster lookup
CREATE INDEX IF NOT EXISTS idx_deposits_chapa_reference ON deposits(chapa_reference) WHERE chapa_reference IS NOT NULL;

-- Update payment_method for existing records
UPDATE deposits 
SET payment_method = 'chapa' 
WHERE payment_method = 'telebirr';

-- Remove telebirr settings if they exist
DELETE FROM settings WHERE key IN ('telebirr_api_key', 'telebirr_merchant_id', 'telebirr_merchant_name', 'telebirr_test_mode');