import api from './api';

// Types for Admin Roles and Permissions
export interface AdminRole {
  id: number;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_superadmin: boolean;
  permissions?: string[];
}

export interface AdminUser {
  id: number;
  username: string;
  role_id: number;
  role_name?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
}

export interface AdminPermission {
  id: number;
  name: string;
  description: string;
}

export interface CreateAdminRoleRequest {
  name: string;
  description?: string;
  permissions: string[];
}

export interface UpdateAdminRoleRequest {
  name?: string;
  description?: string;
  permissions?: string[];
}

export interface CreateAdminUserRequest {
  username: string;
  password: string;
  role_id: number;
  is_active?: boolean;
}

export interface UpdateAdminUserRequest {
  role_id?: number;
  is_active?: boolean;
  password?: string;
}

export interface AdminActivityLog {
  id: number;
  user_id: number;
  username: string;
  action: string;
  resource_type: string;
  resource_id?: number;
  details?: any;
  ip_address?: string;
  created_at: string;
}

// Admin Roles API Functions
export const getAdminRoles = async (): Promise<{ roles: AdminRole[] }> => {
  const response = await api.get('/admin/roles');
  return response.data;
};

export const getAdminRole = async (id: number): Promise<{ role: AdminRole }> => {
  const response = await api.get(`/admin/roles/${id}`);
  return response.data;
};

export const createAdminRole = async (roleData: CreateAdminRoleRequest): Promise<{ role: AdminRole }> => {
  const response = await api.post('/admin/roles', roleData);
  return response.data;
};

export const updateAdminRole = async (id: number, roleData: UpdateAdminRoleRequest): Promise<{ role: AdminRole }> => {
  const response = await api.put(`/admin/roles/${id}`, roleData);
  return response.data;
};

export const deleteAdminRole = async (id: number): Promise<{ message: string }> => {
  const response = await api.delete(`/admin/roles/${id}`);
  return response.data;
};

// Admin Users API Functions
export const getAdminUsers = async (): Promise<{ users: AdminUser[] }> => {
  const response = await api.get('/admin/staff');
  return response.data;
};

export const getAdminUser = async (id: number): Promise<{ user: AdminUser }> => {
  const response = await api.get(`/admin/staff/${id}`);
  return response.data;
};

export const createAdminUser = async (userData: CreateAdminUserRequest): Promise<{ user: AdminUser }> => {
  const response = await api.post('/admin/staff', userData);
  return response.data;
};

export const updateAdminUser = async (id: number, userData: UpdateAdminUserRequest): Promise<{ user: AdminUser }> => {
  const response = await api.put(`/admin/staff/${id}`, userData);
  return response.data;
};

export const deleteAdminUser = async (id: number): Promise<{ message: string }> => {
  const response = await api.delete(`/admin/staff/${id}`);
  return response.data;
};

export const resetAdminUserPassword = async (id: number, newPassword: string): Promise<{ message: string }> => {
  const response = await api.post(`/admin/staff/${id}/reset-password`, { password: newPassword });
  return response.data;
};

export const getCurrentUserPermissions = async (): Promise<{ permissions: string[] }> => {
  // Explicitly ensure token is available for this critical call
  const token = localStorage.getItem('admin_token');
  if (!token) {
    throw new Error('No admin token available');
  }

  const response = await api.get('/admin/users/me/permissions', {
    headers: {
      'x-admin-token': token
    }
  });
  return response.data;
};

// Admin Permissions API Functions
export const getAllPermissions = async (): Promise<{ permissions: AdminPermission[] }> => {
  const response = await api.get('/admin/permissions');
  return response.data;
};

// Admin Activity Logs API Functions
export interface ActivityLogsFilter {
  user_id?: number;
  action?: string;
  resource_type?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export const getAdminActivityLogs = async (filters?: ActivityLogsFilter): Promise<{ 
  logs: AdminActivityLog[],
  pagination: {
    page: number,
    total: number,
    limit: number,
    pages: number
  }
}> => {
  let url = '/admin/activity-logs';
  
  if (filters) {
    const params = new URLSearchParams();
    
    if (filters.user_id) params.append('user_id', filters.user_id.toString());
    if (filters.action) params.append('action', filters.action);
    if (filters.resource_type) params.append('resource_type', filters.resource_type);
    if (filters.start_date) params.append('start_date', filters.start_date);
    if (filters.end_date) params.append('end_date', filters.end_date);
    if (filters.page) params.append('page', filters.page.toString());
    if (filters.limit) params.append('limit', filters.limit.toString());
    
    url += `?${params.toString()}`;
  }
  
  const response = await api.get(url);
  return response.data;
};