-- Migration: Add phone_number and email columns to telegram_users table
-- This migration adds missing profile fields that are expected by the API

-- Add phone_number column
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS phone_number VARCHAR(20);

-- Add email column
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Create index for phone number lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_telegram_users_phone_number ON telegram_users(phone_number);

-- Create index for email lookups (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_telegram_users_email ON telegram_users(email);

-- Add updated_at column
ALTER TABLE telegram_users
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();