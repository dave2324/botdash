"use client";

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';

interface ProtectedRouteProps {
  permission?: string;
  permissions?: string[];
  requireSuperAdmin?: boolean;
  children: React.ReactNode;
}

/**
 * A higher-order component for protecting routes based on permissions
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  permission,
  permissions = [],
  requireSuperAdmin = false,
  children,
}) => {
  const { isAuthenticated, hasPermission, isSuperAdmin, loading } = useAuth();
  const router = useRouter();
  
  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) {
        router.push('/login');
        return;
      }
      
      // Check for superadmin requirement
      if (requireSuperAdmin && !isSuperAdmin) {
        router.push('/dashboard');
        return;
      }
      
      // Check for specific permission
      if (permission && !hasPermission(permission)) {
        router.push('/dashboard');
        return;
      }
      
      // Check for any permission in the list
      if (permissions.length > 0 && !permissions.some(p => hasPermission(p))) {
        router.push('/dashboard');
        return;
      }
    }
  }, [isAuthenticated, hasPermission, isSuperAdmin, loading, router, permission, permissions, requireSuperAdmin]);
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }
  
  return <>{children}</>;
};

export default ProtectedRoute;