"use client";

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface RequirePermissionProps {
  permission: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A component that renders its children only if the current user has the required permission
 */
export const RequirePermission: React.FC<RequirePermissionProps> = ({ 
  permission, 
  children, 
  fallback = null 
}) => {
  const { hasPermission } = useAuth();
  
  if (hasPermission(permission)) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
};

interface RequireAnyPermissionProps {
  permissions: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A component that renders its children if the current user has any of the specified permissions
 */
export const RequireAnyPermission: React.FC<RequireAnyPermissionProps> = ({ 
  permissions, 
  children, 
  fallback = null 
}) => {
  const { hasPermission } = useAuth();
  
  if (permissions.some(permission => hasPermission(permission))) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
};

interface RequireSuperAdminProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * A component that renders its children only if the current user is a superadmin
 */
export const RequireSuperAdmin: React.FC<RequireSuperAdminProps> = ({ 
  children, 
  fallback = null 
}) => {
  const { isSuperAdmin } = useAuth();
  
  if (isSuperAdmin) {
    return <>{children}</>;
  }
  
  return <>{fallback}</>;
};