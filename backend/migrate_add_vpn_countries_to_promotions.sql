-- Add vpn_countries field to user_submitted_promotions table
ALTER TABLE user_submitted_promotions
ADD COLUMN IF NOT EXISTS vpn_countries TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN user_submitted_promotions.vpn_countries IS 'Array of country codes that users must use VPN from to access this promotion';

-- Add index for efficient VPN countries filtering
CREATE INDEX IF NOT EXISTS idx_user_submitted_promotions_vpn_countries
ON user_submitted_promotions USING GIN (vpn_countries)
WHERE vpn_countries IS NOT NULL AND array_length(vpn_countries, 1) > 0;