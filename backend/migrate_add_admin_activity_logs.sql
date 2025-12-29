-- Migration to add admin activity logs
-- This migration adds the ability to log all admin actions for auditing purposes
-- It creates the necessary tables for role-based access control and activity logging

-- Create admin_roles table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Add is_superadmin column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name='admin_roles' AND column_name='is_superadmin') THEN
    ALTER TABLE admin_roles ADD COLUMN is_superadmin BOOLEAN DEFAULT FALSE;
  END IF;
END
$$;

-- Create admin_permissions table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  category VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create admin_role_permissions table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_role_id
    FOREIGN KEY (role_id)
    REFERENCES admin_roles(id)
    ON DELETE CASCADE,
    
  CONSTRAINT fk_permission_id
    FOREIGN KEY (permission_id)
    REFERENCES admin_permissions(id)
    ON DELETE CASCADE,
    
  CONSTRAINT unique_role_permission UNIQUE (role_id, permission_id)
);

-- Create admin_users table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email VARCHAR(255),
  role_id INTEGER,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  
  CONSTRAINT fk_role_id
    FOREIGN KEY (role_id)
    REFERENCES admin_roles(id)
    ON DELETE SET NULL
);

-- Create admin_activity_logs table
CREATE TABLE IF NOT EXISTS admin_activity_logs (
  id SERIAL PRIMARY KEY,
  admin_user_id INTEGER NOT NULL,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50),
  target_id INTEGER,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_admin_user_id
    FOREIGN KEY (admin_user_id)
    REFERENCES admin_users(id)
    ON DELETE CASCADE
);

-- Create indexes for efficient querying
CREATE INDEX idx_admin_activity_logs_admin_user_id ON admin_activity_logs(admin_user_id);
CREATE INDEX idx_admin_activity_logs_action ON admin_activity_logs(action);
CREATE INDEX idx_admin_activity_logs_target_type ON admin_activity_logs(target_type);
CREATE INDEX idx_admin_activity_logs_created_at ON admin_activity_logs(created_at);

-- Insert default superadmin role if it doesn't exist
INSERT INTO admin_roles (name, description, permissions)
SELECT 'superadmin', 'Super Administrator with all privileges', '{"all":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM admin_roles WHERE name = 'superadmin'
);

-- Update superadmin role to set is_superadmin flag if column exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name='admin_roles' AND column_name='is_superadmin') THEN
    UPDATE admin_roles SET is_superadmin = TRUE WHERE name = 'superadmin';
  END IF;
END
$$;

-- Insert default admin role if it doesn't exist
INSERT INTO admin_roles (name, description, permissions)
SELECT 'admin', 'Regular administrator with limited privileges', '{}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM admin_roles WHERE name = 'admin'
);

-- Add view_activity_logs permission if it doesn't exist
INSERT INTO admin_permissions (name, description, category)
SELECT 'view_activity_logs', 'View admin activity logs', 'monitoring'
WHERE NOT EXISTS (
  SELECT 1 FROM admin_permissions WHERE name = 'view_activity_logs'
);

-- Grant this permission to superadmin role
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT 
  (SELECT id FROM admin_roles WHERE name = 'superadmin'),
  (SELECT id FROM admin_permissions WHERE name = 'view_activity_logs')
WHERE NOT EXISTS (
  SELECT 1 FROM admin_role_permissions rp
  JOIN admin_roles r ON r.id = rp.role_id
  JOIN admin_permissions p ON p.id = rp.permission_id
  WHERE r.name = 'superadmin' AND p.name = 'view_activity_logs'
);

-- Add other essential permissions
INSERT INTO admin_permissions (name, description, category)
VALUES
  ('manage_roles', 'Create, update, and delete admin roles', 'admin'),
  ('manage_admin_users', 'Create, update, and delete admin users', 'admin')
ON CONFLICT (name) DO NOTHING;