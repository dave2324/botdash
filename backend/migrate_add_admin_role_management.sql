-- Admin Role Management Migration
-- This migration adds tables for role-based access control in the admin panel

-- Create admin_roles table
CREATE TABLE IF NOT EXISTS admin_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create admin_permissions table
CREATE TABLE IF NOT EXISTS admin_permissions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    resource VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role_id INTEGER REFERENCES admin_roles(id),
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create admin_role_permissions junction table
CREATE TABLE IF NOT EXISTS admin_role_permissions (
    role_id INTEGER REFERENCES admin_roles(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES admin_permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- Create admin_activity_logs table
CREATE TABLE IF NOT EXISTS admin_activity_logs (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admin_users(id),
    action VARCHAR(255) NOT NULL,
    entity_type VARCHAR(100),
    entity_id VARCHAR(100),
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default superadmin role
INSERT INTO admin_roles (name, description) 
VALUES ('superadmin', 'Full access to all system features and settings');

-- Insert default admin role
INSERT INTO admin_roles (name, description) 
VALUES ('admin', 'Access to operational tasks without system settings');

-- Insert default permissions
-- Task management permissions
INSERT INTO admin_permissions (name, description, resource) 
VALUES 
    ('view_tasks', 'View all tasks', 'tasks'),
    ('approve_tasks', 'Approve or reject pending tasks', 'tasks'),
    ('create_tasks', 'Create new tasks', 'tasks'),
    ('edit_tasks', 'Edit existing tasks', 'tasks'),
    ('delete_tasks', 'Delete tasks', 'tasks'),
    
    -- User management permissions
    ('view_users', 'View all users', 'users'),
    ('edit_users', 'Edit user details', 'users'),
    ('adjust_user_balance', 'Add or subtract from user balance', 'users'),
    ('delete_users', 'Delete user accounts', 'users'),
    
    -- Finance permissions
    ('view_finances', 'View financial data', 'finances'),
    ('manage_withdrawals', 'Approve/reject withdrawal requests', 'finances'),
    ('view_transactions', 'View transaction logs', 'finances'),
    
    -- Settings permissions
    ('view_settings', 'View system settings', 'settings'),
    ('edit_settings', 'Modify system settings', 'settings'),
    
    -- Admin management (for superadmin)
    ('view_admins', 'View admin accounts', 'admins'),
    ('manage_admins', 'Create/edit/delete admin accounts', 'admins'),
    ('manage_roles', 'Create/edit/delete roles and permissions', 'roles');

-- Assign all permissions to superadmin role
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM admin_roles WHERE name = 'superadmin'),
    id
FROM admin_permissions;

-- Assign operational permissions to admin role
INSERT INTO admin_role_permissions (role_id, permission_id)
SELECT 
    (SELECT id FROM admin_roles WHERE name = 'admin'),
    id
FROM admin_permissions 
WHERE name IN (
    'view_tasks', 'approve_tasks', 
    'view_users', 
    'view_finances', 'view_transactions',
    'view_settings'
);

-- Create indexes for better query performance
CREATE INDEX admin_users_role_id_idx ON admin_users(role_id);
CREATE INDEX admin_activity_logs_admin_id_idx ON admin_activity_logs(admin_id);
CREATE INDEX admin_activity_logs_created_at_idx ON admin_activity_logs(created_at);