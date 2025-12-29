"use client";

import { useState, useEffect, JSX } from 'react';
import ProtectedRoute from '@/components/auth/protected-route';
import { 
  getAdminActivityLogs, 
  AdminActivityLog,
  ActivityLogsFilter,
  getAdminUsers,
  AdminUser
} from '@/lib/admin-api';

// Format date for filtering
const formatDateForFilter = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

// Format date for display
const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

export default function ActivityLogsPage() {
  const [logs, setLogs] = useState<AdminActivityLog[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [limit] = useState(20); // Number of logs per page
  
  // Filter state
  const [filters, setFilters] = useState<ActivityLogsFilter>({
    user_id: undefined,
    action: undefined,
    resource_type: undefined,
    start_date: undefined,
    end_date: undefined,
    page: 1,
    limit: 20
  });
  
  // Distinct filter options derived from logs data
  const [actionTypes, setActionTypes] = useState<string[]>([]);
  const [resourceTypes, setResourceTypes] = useState<string[]>([]);
  
  // Fetch activity logs
  const fetchLogs = async (filterParams: ActivityLogsFilter = filters) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await getAdminActivityLogs(filterParams);
      setLogs(response.logs);
      setTotalPages(Math.ceil(response.pagination.total / response.pagination.limit));
      
      // Extract distinct action and resource types for filters
      const actions = new Set<string>();
      const resources = new Set<string>();
      
      response.logs.forEach(log => {
        if (log.action) actions.add(log.action);
        if (log.resource_type) resources.add(log.resource_type);
      });
      
      setActionTypes(Array.from(actions).sort());
      setResourceTypes(Array.from(resources).sort());
    } catch (err: any) {
      setError(err.message || 'An error occurred while fetching activity logs');
    } finally {
      setLoading(false);
    }
  };
  
  // Fetch users for the filter dropdown
  const fetchUsers = async () => {
    try {
      const response = await getAdminUsers();
      setUsers(response.users);
    } catch (err) {
      console.error('Failed to fetch admin users for filter', err);
    }
  };
  
  // Initial data fetch
  useEffect(() => {
    fetchLogs();
    fetchUsers();
  }, []);
  
  // Handle page change
  const handlePageChange = (newPage: number) => {
    const newFilters = { ...filters, page: newPage };
    setPage(newPage);
    setFilters(newFilters);
    fetchLogs(newFilters);
  };
  
  // Handle filter changes
  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value, page: 1 };
    setPage(1); // Reset to first page when filters change
    setFilters(newFilters);
    fetchLogs(newFilters);
  };
  
  // Reset all filters
  const resetFilters = () => {
    const newFilters = {
      user_id: undefined,
      action: undefined,
      resource_type: undefined,
      start_date: undefined,
      end_date: undefined,
      page: 1,
      limit
    };
    setPage(1);
    setFilters(newFilters);
    fetchLogs(newFilters);
  };
  
  // Get badge color based on action type
  const getActionBadgeColor = (action: string): string => {
    switch (action.toLowerCase()) {
      case 'create':
        return 'bg-green-100 text-green-800';
      case 'update':
        return 'bg-blue-100 text-blue-800';
      case 'delete':
        return 'bg-red-100 text-red-800';
      case 'login':
        return 'bg-purple-100 text-purple-800';
      case 'logout':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
  
  // Format log details for display
  const formatLogDetails = (log: AdminActivityLog): JSX.Element => {
    if (!log.details) return <span>No details available</span>;
    
    try {
      let details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      
      return (
        <div className="text-xs">
          {Object.entries(details).map(([key, value]) => (
            <div key={key} className="mb-1">
              <span className="font-semibold">{key}: </span>
              <span>{JSON.stringify(value)}</span>
            </div>
          ))}
        </div>
      );
    } catch (err) {
      return <span>{typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}</span>;
    }
  };
  
  return (
    <ProtectedRoute permission="view_activity_logs">
      <div className="container mx-auto p-4">
        <h1 className="text-2xl font-bold mb-6">Admin Activity Logs</h1>
        
        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">Filters</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="user-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Admin User
              </label>
              <select
                id="user-filter"
                value={filters.user_id || ''}
                onChange={(e) => handleFilterChange('user_id', e.target.value ? parseInt(e.target.value, 10) : undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Users</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>{user.username}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="action-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Action Type
              </label>
              <select
                id="action-filter"
                value={filters.action || ''}
                onChange={(e) => handleFilterChange('action', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Actions</option>
                {actionTypes.map(action => (
                  <option key={action} value={action}>{action}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="resource-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Resource Type
              </label>
              <select
                id="resource-filter"
                value={filters.resource_type || ''}
                onChange={(e) => handleFilterChange('resource_type', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Resources</option>
                {resourceTypes.map(resource => (
                  <option key={resource} value={resource}>{resource}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                id="start-date"
                value={filters.start_date || ''}
                onChange={(e) => handleFilterChange('start_date', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
            
            <div>
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                id="end-date"
                value={filters.end_date || ''}
                onChange={(e) => handleFilterChange('end_date', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              />
            </div>
          </div>
          
          <div className="mt-4 flex justify-end">
            <button
              onClick={resetFilters}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Reset Filters
            </button>
          </div>
        </div>
        
        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md mb-4">
            {error}
          </div>
        )}
        
        {/* Activity Logs Table */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden mb-4">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Action
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Resource
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Details
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      IP Address
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(log.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {log.username}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getActionBadgeColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {log.resource_type}
                          {log.resource_id && <span className="ml-1 text-gray-500">#{log.resource_id}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-500">
                          {formatLogDetails(log)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {log.ip_address || 'Unknown'}
                      </td>
                    </tr>
                  ))}
                  
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                        No activity logs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center mt-4">
                <nav className="flex items-center">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 rounded-md mr-2 bg-white border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  <div className="flex space-x-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                      .map((p, i, arr) => {
                        // Add ellipsis when there are pages skipped
                        if (i > 0 && p > arr[i-1] + 1) {
                          return (
                            <span key={`ellipsis-${p}`} className="px-3 py-1">...</span>
                          );
                        }
                        
                        return (
                          <button
                            key={p}
                            onClick={() => handlePageChange(p)}
                            className={`px-3 py-1 rounded-md ${
                              p === page 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                  </div>
                  
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page === totalPages}
                    className="px-3 py-1 rounded-md ml-2 bg-white border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </nav>
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}