-- Migration: Add reward_id column to spins table
-- This should be run on the existing database to add the missing column

-- Add the reward_id column (allowing NULL for existing records)
ALTER TABLE spins 
ADD COLUMN reward_id INT REFERENCES spin_wheel_rewards(id);

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
