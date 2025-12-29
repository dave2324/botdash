-- Add Chapa transfer fields to withdrawals table
ALTER TABLE withdrawals 
ADD COLUMN IF NOT EXISTS chapa_transfer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS chapa_response JSONB;

-- Add Chapa fields to deposits table
ALTER TABLE deposits
ADD COLUMN IF NOT EXISTS chapa_checkout_url TEXT,
ADD COLUMN IF NOT EXISTS chapa_reference VARCHAR(255),
ADD COLUMN IF NOT EXISTS chapa_response JSONB;

-- Add index for faster lookup
CREATE INDEX IF NOT EXISTS idx_withdrawals_chapa_transfer_id 
ON withdrawals(chapa_transfer_id) 
WHERE chapa_transfer_id IS NOT NULL;

-- Add index for deposits chapa reference
CREATE INDEX IF NOT EXISTS idx_deposits_chapa_reference
ON deposits(chapa_reference)
WHERE chapa_reference IS NOT NULL;

-- Add withdrawal-specific settings if not exists
INSERT INTO settings (key, value, description)
VALUES 
  ('withdrawal_auto_process', '1', 'Enable automatic withdrawal processing via Chapa'),
  ('withdrawal_max_auto_amount', '10000', 'Maximum amount for automatic withdrawal processing')
ON CONFLICT (key) DO NOTHING;