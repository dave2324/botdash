"use client";

import { useState, useEffect } from 'react';
import ProtectedRoute from '@/components/auth/protected-route';
import { 
  getAdminRoles, 
  getAllPermissions,
  createAdminRole, 
  updateAdminRole, 
  deleteAdminRole,
  AdminRole,
  AdminPermission
} from '@/lib/admin-api';
import { useAuth } from '@/contexts/AuthContext';

// Role creation/edit dialog component
interface RoleDialogProps {
  isOpen: boolean;
  role: Partial<AdminRole> | null;
  allPermissions: AdminPermission[];
  onClose: () => void;
  onSave: (role: any) => Promise<void>;
}

const RoleDialog: React.FC<RoleDialogProps> = ({ 
  isOpen, 
  role, 
  allPermissions,
  onClose, 
  onSave 
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize form when role changes
  useEffect(() => {
    if (role) {
      setName(role.name || '');
      setDescription(role.description || '');
      // Handle permissions whether they come as array or object
      const permissions = role.permissions || [];
      if (Array.isArray(permissions)) {
        setSelectedPermissions(permissions);
      } else {
        // If permissions is an object, get its keys
        setSelectedPermissions(Object.keys(permissions));
      }
    } else {
      setName('');
      setDescription('');
      setSelectedPermissions([]);
    }
    setError(null);
  }, [role]);
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    
    try {
      await onSave({
        id: role?.id,
        name,
        description,
        permissions: selectedPermissions
      });
      
      onClose();
    } catch (err: any) {
      setError(err.message || 'An error occurred while saving the role');
    } finally {
      setSaving(false);
    }
  };
  
  const togglePermission = (permission: string) => {
    setSelectedPermissions(prev => {
      if (prev.includes(permission)) {
        return prev.filter(p => p !== permission);
      } else {
        return [...prev, permission];
      }
    });
  };
  
  // Group permissions by category
  const groupedPermissions: Record<string, AdminPermission[]> = {};
  allPermissions.forEach(permission => {
    const category = permission.name.split('_')[0];
    if (!groupedPermissions[category]) {
      groupedPermissions[category] = [];
    }
    groupedPermissions[category].push(permission);
  });
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-screen overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">
            {role?.id ? 'Edit Role' : 'Create New Role'}
          </h2>
          
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md mb-4">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Role Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            
            <div className="mb-4">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Permissions
              </label>
              <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                {Object.entries(groupedPermissions).map(([category, permissions]) => (
                  <div key={category} className="mb-4">
                    <h3 className="text-sm font-semibold uppercase text-gray-600 mb-2">
                      {category}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                      {permissions.map(permission => (
                        <div key={permission.id} className="flex items-center">
                          <input
                            type="checkbox"
                            id={`permission-${permission.id}`}
                            checked={selectedPermissions.includes(permission.name)}
                            onChange={() => togglePermission(permission.name)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label 
                            htmlFor={`permission-${permission.id}`}
                            className="ml-2 text-sm text-gray-700"
                            title={permission.description}
                          >
                            {permission.name.replace(/_/g, ' ').replace(`${category} `, '')}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
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

// Delete confirmation dialog component
interface DeleteConfirmationProps {
  isOpen: boolean;
  roleName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

const DeleteConfirmation: React.FC<DeleteConfirmationProps> = ({ 
  isOpen, 
  roleName, 
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
      setError(err.message || 'An error occurred while deleting the role');
    } finally {
      setDeleting(false);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6">
        <h2 className="text-xl font-semibold mb-4">Delete Role</h2>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <p className="mb-4">
          Are you sure you want to delete the role <strong>{roleName}</strong>? 
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
export default function AdminRolesPage() {
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [allPermissions, setAllPermissions] = useState<AdminPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Partial<AdminRole> | null>(null);
  
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<AdminRole | null>(null);
  
  const { isSuperAdmin } = useAuth();
  
  // Fetch roles and permissions
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const [rolesResponse, permissionsResponse] = await Promise.all([
        getAdminRoles(),
        getAllPermissions()
      ]);
      
      setRoles(rolesResponse.roles);
      setAllPermissions(permissionsResponse.permissions);
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching roles');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  // Handle creating or updating a role
  const handleSaveRole = async (roleData: any) => {
    if (roleData.id) {
      // Update existing role
      await updateAdminRole(roleData.id, {
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions
      });
    } else {
      // Create new role
      await createAdminRole({
        name: roleData.name,
        description: roleData.description,
        permissions: roleData.permissions
      });
    }
    
    // Refresh the roles list
    await fetchData();
  };
  
  // Handle role deletion
  const handleDeleteRole = async () => {
    if (roleToDelete) {
      await deleteAdminRole(roleToDelete.id);
      await fetchData();
    }
  };
  
  // Open dialog for creating a new role
  const handleNewRole = () => {
    setSelectedRole(null);
    setIsDialogOpen(true);
  };
  
  // Open dialog for editing a role
  const handleEditRole = (role: AdminRole) => {
    setSelectedRole(role);
    setIsDialogOpen(true);
  };
  
  // Open confirmation dialog for deleting a role
  const handleDeleteClick = (role: AdminRole) => {
    setRoleToDelete(role);
    setIsDeleteConfirmOpen(true);
  };
  
  return (
    <ProtectedRoute permission="manage_roles" requireSuperAdmin={false}>
      <div className="container mx-auto p-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Admin Roles</h1>
          <button
            onClick={handleNewRole}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Create Role
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
                    Role Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Permissions
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {role.name}
                          {role.is_superadmin && (
                            <span className="ml-2 text-xs font-semibold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">
                              Superadmin
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {role.description}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500 max-h-20 overflow-y-auto">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(role.permissions) ? role.permissions.map((permission) => (
                            <span
                              key={permission}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                            >
                              {permission.replace(/_/g, ' ')}
                            </span>
                          )) : role.permissions ? Object.keys(role.permissions).map((permission) => (
                            <span
                              key={permission}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                            >
                              {permission.replace(/_/g, ' ')}
                            </span>
                          )) : null}
                          {(!role.permissions || (Array.isArray(role.permissions) && !role.permissions.length) || (!Array.isArray(role.permissions) && !Object.keys(role.permissions || {}).length)) && <span className="text-gray-400">No permissions</span>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditRole(role)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        Edit
                      </button>
                      {!role.is_superadmin && (
                        <button
                          onClick={() => handleDeleteClick(role)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                
                {roles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                      No roles found. Create one to get started.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Role Dialog */}
        <RoleDialog
          isOpen={isDialogOpen}
          role={selectedRole}
          allPermissions={allPermissions}
          onClose={() => setIsDialogOpen(false)}
          onSave={handleSaveRole}
        />
        
        {/* Delete Confirmation */}
        <DeleteConfirmation
          isOpen={isDeleteConfirmOpen}
          roleName={roleToDelete?.name || ''}
          onClose={() => setIsDeleteConfirmOpen(false)}
          onConfirm={handleDeleteRole}
        />
      </div>
    </ProtectedRoute>
  );
}