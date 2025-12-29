"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { login as apiLogin, LoginCredentials } from '@/lib/api';
import { getCurrentUserPermissions } from '@/lib/admin-api';
import { useRouter } from 'next/navigation';

interface UserWithRole {
  id?: number;
  username: string;
  role?: string;
  role_id?: number;
  is_superadmin?: boolean;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: UserWithRole | null;
  permissions: string[];
  hasPermission: (permission: string) => boolean;
  isSuperAdmin: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserWithRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Function to fetch user permissions
  const fetchUserPermissions = async () => {
    try {
      const { permissions } = await getCurrentUserPermissions();
      setPermissions(permissions);
      
      // Check if user has superadmin privileges
      const superadmin = localStorage.getItem('admin_is_superadmin') === 'true';
      setIsSuperAdmin(superadmin);
      
      return permissions;
    } catch (error) {
      console.error('Failed to fetch permissions:', error);
      return [];
    }
  };

  useEffect(() => {
    // Check if user is logged in on initial load
    const token = localStorage.getItem('admin_token');
    const username = localStorage.getItem('admin_username');
    const role = localStorage.getItem('admin_role');
    const roleId = localStorage.getItem('admin_role_id');
    const isSuperAdmin = localStorage.getItem('admin_is_superadmin');
    
    if (token && username) {
      // Ensure cookies are also set for middleware
      document.cookie = `admin_token=${token}; path=/; max-age=86400`;
      document.cookie = `admin_username=${username}; path=/; max-age=86400`;
      
      const userData: UserWithRole = {
        username,
        role: role || undefined,
        role_id: roleId ? parseInt(roleId, 10) : undefined,
        is_superadmin: isSuperAdmin === 'true'
      };
      
      setUser(userData);
      setIsSuperAdmin(isSuperAdmin === 'true');
      
      // Fetch user permissions
      fetchUserPermissions();
    }
    
    setLoading(false);
  }, []);

  const login = async (credentials: LoginCredentials) => {
    try {
      setLoading(true);
      const response = await apiLogin(credentials);
      
      // Save token and user info to localStorage and cookies
      localStorage.setItem('admin_token', response.token);
      localStorage.setItem('admin_username', response.username);
      
      // Store additional user information if available
      if (response.role) localStorage.setItem('admin_role', response.role);
      if (response.role_id) localStorage.setItem('admin_role_id', response.role_id.toString());
      if (response.is_superadmin !== undefined) {
        localStorage.setItem('admin_is_superadmin', response.is_superadmin ? 'true' : 'false');
        setIsSuperAdmin(response.is_superadmin);
      }
      
      // Set cookies for middleware authentication
      document.cookie = `admin_token=${response.token}; path=/; max-age=86400`;
      document.cookie = `admin_username=${response.username}; path=/; max-age=86400`;
      
      // Create user object with role information if available
      const userData: UserWithRole = {
        username: response.username,
        role: response.role,
        role_id: response.role_id,
        is_superadmin: response.is_superadmin
      };
      
      setUser(userData);

      // Fetch permissions for the logged-in user (ensure token is available first)
      try {
        await fetchUserPermissions();
      } catch (error) {
        console.warn('Failed to fetch permissions during login:', error);
        // Continue with login process even if permissions fetch fails
      }

      // Force navigation using window.location for reliable redirect after login
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    // Clear localStorage
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_username');
    localStorage.removeItem('admin_role');
    localStorage.removeItem('admin_role_id');
    localStorage.removeItem('admin_is_superadmin');
    
    // Clear cookies
    document.cookie = 'admin_token=; path=/; max-age=0';
    document.cookie = 'admin_username=; path=/; max-age=0';
    
    setUser(null);
    setPermissions([]);
    setIsSuperAdmin(false);
    window.location.href = '/login';
  };
  
  // Function to check if user has a specific permission
  const hasPermission = (permission: string): boolean => {
    if (isSuperAdmin) return true;
    return permissions.includes(permission);
  };

  const value = {
    isAuthenticated: !!user,
    user,
    permissions,
    hasPermission,
    isSuperAdmin,
    login,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext; 