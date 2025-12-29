-- Add soft delete capability to user_withdrawal_accounts
ALTER TABLE user_withdrawal_accounts 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Create index for active accounts
CREATE INDEX IF NOT EXISTS idx_user_withdrawal_accounts_active 
ON user_withdrawal_accounts(user_id, is_active) 
WHERE is_active = TRUE;

-- Update the foreign key constraint to allow NULL values
ALTER TABLE withdrawals 
DROP CONSTRAINT IF EXISTS withdrawals_withdrawal_account_id_fkey,
ADD CONSTRAINT withdrawals_withdrawal_account_id_fkey 
  FOREIGN KEY (withdrawal_account_id) 
  REFERENCES user_withdrawal_accounts(id) 
  ON DELETE SET NULL;