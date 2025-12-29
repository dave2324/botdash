-- Migration: Add vpn_countries field to youtube_tasks table
-- Date: 2025-08-09
-- Description: Add TEXT[] field to control VPN country requirements for video tasks

-- Add vpn_countries column to youtube_tasks table
ALTER TABLE youtube_tasks 
ADD COLUMN IF NOT EXISTS vpn_countries TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN youtube_tasks.vpn_countries IS 'Array of country codes that users must use VPN from to access this video task';
