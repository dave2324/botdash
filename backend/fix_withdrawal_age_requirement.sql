-- Check current value of withdrawal_min_account_age_days
SELECT key, value, description 
FROM settings 
WHERE key = 'withdrawal_min_account_age_days';

-- Update the account age requirement from 76 days to 7 days (1 week)
UPDATE settings 
SET value = '7',
    description = 'Minimum account age in days required for withdrawal',
    updated_at = NOW()
WHERE key = 'withdrawal_min_account_age_days';

-- Verify the update
SELECT key, value, description, updated_at
FROM settings 
WHERE key = 'withdrawal_min_account_age_days';

-- Also check other withdrawal requirements
SELECT key, value, description 
FROM settings 
WHERE key IN (
    'withdrawal_min_account_age_days',
    'withdrawal_min_tasks_completed', 
    'withdrawal_min_points',
    'withdrawal_enabled'
)
ORDER BY key;