"use client";

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/protected-route';
import { 
  getAdminRoles, 
  getAdminUsers,
  createAdminUser, 
  updateAdminUser, 
  deleteAdminUser,
  resetAdminUserPassword,
  AdminRole,
  AdminUser
} from '@/lib/admin-api';

// Admin User creation/edit dialog component
interface AdminUserDialogProps {
  isOpen: boolean;
  user: Partial<AdminUser> | null;
  roles: AdminRole[];
  onClose: () => void;
  onSave: (userData: any) => Promise<void>;
}

const AdminUserDialog: React.FC<AdminUserDialogProps> = ({ 
  isOpen, 
  user, 
  roles,
  onClose, 
  onSave 
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [roleId, setRoleId] = useState<number>(0);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize form when user changes
  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setPassword(''); // Don't populate password field for security
      setRoleId(user.role_id || 0);
      setIsActive(user.is_active !== undefined ? user.is_active : true);
    } else {
      setUsername('');
      setPassword('');
      setRoleId(0);
      setIsActive(true);
    }
    setError(null);
  }, [user]);
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    
    try {
      await onSave({
        id: user?.id,
        username,
        password: password || undefined, // Only include password if it's set
        role_id: roleId,
        is_active: isActive
      });
      
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving the user');
    } finally {
      setSaving(false);
    }
  };
  
  const isEditing = !!user?.id;
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {isEditing ? 'Edit Admin User' : 'Create New Admin User'}
          </h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md mb-4">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isEditing}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
                required
              />
              {isEditing && (
                <p className="text-xs text-gray-500 mt-1">Username cannot be changed</p>
              )}
            </div>
            
            <div className="mb-4">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {isEditing ? 'New Password (leave blank to keep current)' : 'Password'}
              </label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required={!isEditing}
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                Role
              </label>
              <select
                id="role"
                value={roleId || ''}
                onChange={(e) => setRoleId(parseInt(e.target.value, 10))}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              >
                <option value="">Select a role</option>
                {roles.map(role => (
                  <option key={role.id} value={role.id}>
                    {role.name} {role.is_superadmin ? '(Superadmin)' : ''}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="mb-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
                  Active account
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Inactive accounts cannot log in
              </p>
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Reset Password Dialog
interface ResetPasswordDialogProps {
  isOpen: boolean;
  userId?: number;
  username?: string;
  onClose: () => void;
  onReset: (userId: number, password: string) => Promise<void>;
}

const ResetPasswordDialog: React.FC<ResetPasswordDialogProps> = ({
  isOpen,
  userId,
  username,
  onClose,
  onReset
}) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setConfirmPassword('');
      setError(null);
    }
  }, [isOpen]);
  
  if (!isOpen || !userId) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setResetting(true);
    setError(null);
    
    try {
      await onReset(userId, password);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while resetting the password');
    } finally {
      setResetting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            Reset Password for {username}
          </h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md mb-4">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                id="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirm-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div className="flex justify-end space-x-2 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetting}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {resetting ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Delete confirmation dialog component
interface DeleteConfirmationProps {
  isOpen: boolean;
  username: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({ 
  isOpen, 
  username, 
  onClose, 
  onConfirm 
}) => {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  if (!isOpen) return null;
  
  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    
    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while deleting the user');
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-xl font-semibold mb-4">Delete Admin User</h2>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <p className="mb-4">
          Are you sure you want to delete the user <strong>{username}</strong>? 
          This action cannot be undone.
        </p>
        
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={deleting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
};

// Main page component
export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Partial<AdminUser> | null>(null);
  
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  
  const [isResetPasswordOpen, setIsResetPasswordOpen] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<AdminUser | null>(null);
  
  // Fetch users and roles
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [usersResponse, rolesResponse] = await Promise.all([
        getAdminUsers(),
        getAdminRoles()
      ]);
      
      setUsers(usersResponse.users);
      setRoles(rolesResponse.roles);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching admin users');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  // Handle creating or updating a user
  const handleSaveUser = async (userData: any) => {
    if (userData.id) {
      // Update existing user
      await updateAdminUser(userData.id, {
        role_id: userData.role_id,
        is_active: userData.is_active,
        password: userData.password
      });
    } else {
      // Create new user
      await createAdminUser({
        username: userData.username,
        password: userData.password,
        role_id: userData.role_id,
        is_active: userData.is_active
      });
    }
    
    // Refresh the users list
    await fetchData();
  };
  
  // Handle user deletion
  const handleDeleteUser = async () => {
    if (userToDelete) {
      await deleteAdminUser(userToDelete.id);
      await fetchData();
    }
  };
  
  // Handle password reset
  const handleResetPassword = async (userId: number, password: string) => {
    await resetAdminUserPassword(userId, password);
    // No need to refresh data as this doesn't change visible user data
  };
  
  // Open dialog for creating a new user
  const handleNewUser = () => {
    setSelectedUser(null);
    setIsUserDialogOpen(true);
  };
  
  // Open dialog for editing a user
  const handleEditUser = (user: AdminUser) => {
    setSelectedUser(user);
    setIsUserDialogOpen(true);
  };
  
  // Open dialog for resetting password
  const handleResetPasswordClick = (user: AdminUser) => {
    setUserToResetPassword(user);
    setIsResetPasswordOpen(true);
  };
  
  // Open confirmation dialog for deleting a user
  const handleDeleteClick = (user: AdminUser) => {
    setUserToDelete(user);
    setIsDeleteConfirmOpen(true);
  };
  
  // Get role name for a user
  const getRoleName = (roleId: number): string => {
    const role = roles.find(r => r.id === roleId);
    return role ? role.name : 'Unknown Role';
  };
  
  return (
    <ProtectedRoute permission="manage_admin_users" requireSuperAdmin={false}>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Admin Users</h1>
          <button
            onClick={handleNewUser}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Create Admin User
          </button>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-4">
            {error}
          </div>
        )}
        
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Username
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Login
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.username}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {user.role_name || getRoleName(user.role_id)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.is_active 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {user.last_login 
                          ? new Date(user.last_login).toLocaleString() 
                          : 'Never'
                        }
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditUser(user)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleResetPasswordClick(user)}
                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                      >
                        Reset Password
                      </button>
                      <button
                        onClick={() => handleDeleteClick(user)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                      No admin users found. Create one to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* User Dialog */}
        <AdminUserDialog
          isOpen={isUserDialogOpen}
          user={selectedUser}
          roles={roles}
          onClose={() => setIsUserDialogOpen(false)}
          onSave={handleSaveUser}
        />
        
        {/* Reset Password Dialog */}
        <ResetPasswordDialog
          isOpen={isResetPasswordOpen}
          userId={userToResetPassword?.id}
          username={userToResetPassword?.username}
          onClose={() => setIsResetPasswordOpen(false)}
          onReset={handleResetPassword}
        />
        
        {/* Delete Confirmation */}
        <DeleteConfirmation
          isOpen={isDeleteConfirmOpen}
          username={userToDelete?.username || ''}
          onClose={() => setIsDeleteConfirmOpen(false)}
          onConfirm={handleDeleteUser}
        />
      </div>
    </ProtectedRoute>
  );
}