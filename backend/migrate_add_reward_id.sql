-- Migration: Add reward_id column to spins table
-- This should be run on the existing database to add the missing column

-- Add the reward_id column (allowing NULL for existing records)
ALTER TABLE spins
ADD COLUMN IF NOT EXISTS reward_id INT;

-- Ensure FK exists (create it only if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    WHERE tc.table_name = 'spins'
      AND tc.constraint_type = 'FOREIGN KEY'
      AND tc.constraint_name = 'spins_reward_id_fkey'
  ) THEN
    ALTER TABLE spins
      ADD CONSTRAINT spins_reward_id_fkey
      FOREIGN KEY (reward_id) REFERENCES spin_wheel_rewards(id);
  END IF;
END $$;

-- Create index for reward_id lookups
CREATE INDEX IF NOT EXISTS idx_spins_reward_id ON spins(reward_id);

-- Optionally, you can update existing spins to link them to rewards
-- based on the result text (this is a best-effort match)
UPDATE spins 
SET reward_id = (
  SELECT id 
  FROM spin_wheel_rewards 
  WHERE label = spins.result 
  LIMIT 1
)
WHERE reward_id IS NULL;
