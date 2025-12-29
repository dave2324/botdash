-- Migration: Reset Chapa API keys from "0" to empty string
-- This fixes settings that were incorrectly stored as "0" instead of empty string

UPDATE settings 
SET value = '' 
WHERE key IN ('chapa_api_key', 'chapa_public_key', 'chapa_webhook_secret') 
  AND value = '0';

-- Verify the changes
SELECT key, value, description 
FROM settings 
WHERE key LIKE 'chapa_%' 
ORDER BY key;
