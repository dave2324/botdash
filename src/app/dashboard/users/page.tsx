"use client";

import React, { useEffect, useState } from 'react';
import { User, getUsers, UsersResponse, setUserBanned, setUserPremium, updateUserPoints } from '@/lib/api';
import AdminLayout from '@/components/layout/AdminLayout';
import Link from 'next/link';
import Image from 'next/image';
import { formatDistanceToNow } from 'date-fns';
import { Dialog } from '@headlessui/react';
import { Switch } from '@/components/ui/switch';
import { Star } from 'lucide-react';

export default function UsersPage() {
  const [usersData, setUsersData] = useState<UsersResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBanLoading, setIsBanLoading] = useState(false);
  const [banError, setBanError] = useState<string | null>(null);
  const [isPremiumLoading, setIsPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState<string | null>(null);
  const [showBanned, setShowBanned] = useState(false);
  const [showPremium, setShowPremium] = useState<boolean | undefined>(undefined);
  
  // Balance adjustment states
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
  const [pointsAmount, setPointsAmount] = useState<string>('');
  const [pointsReason, setPointsReason] = useState<string>('');
  const [isPointsLoading, setIsPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [showPointsForm, setShowPointsForm] = useState(false);

  const fetchUsers = async (page = 1, showBannedUsers = false, premiumFilter?: boolean) => {
    try {
      setIsLoading(true);
      const data = await getUsers(page, 10, showBannedUsers, premiumFilter);
      setUsersData(data);
      setCurrentPage(page);
    } catch (error: any) {
      setError(error.message || 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1, showBanned, showPremium);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBanned, showPremium]);

  const handlePageChange = (page: number) => {
    fetchUsers(page, showBanned, showPremium);
  };

  const filteredUsers = usersData?.users.filter(user => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      user.username?.toLowerCase().includes(searchLower) ||
      user.first_name?.toLowerCase().includes(searchLower) ||
      user.last_name?.toLowerCase().includes(searchLower) ||
      user.id.toString().includes(searchLower)
    );
  });

  const handleBanToggle = async () => {
    if (!selectedUser) return;
    setIsBanLoading(true);
    setBanError(null);
    try {
      const updated = await setUserBanned(selectedUser.id, !selectedUser.is_banned);
      // Update user in usersData
      setUsersData((prev) => prev ? {
        ...prev,
        users: prev.users.map(u => u.id === updated.id ? updated : u)
      } : prev);
      setSelectedUser(updated);
      setIsModalOpen(false);
    } catch (err: any) {
      setBanError(err.message || 'Failed to update ban status');
    } finally {
      setIsBanLoading(false);
    }
  };

  const handlePremiumToggle = async () => {
    if (!selectedUser) return;
    setIsPremiumLoading(true);
    setPremiumError(null);
    try {
      const updated = await setUserPremium(selectedUser.id, !selectedUser.is_premium);
      // Update user in usersData
      setUsersData((prev) => prev ? {
        ...prev,
        users: prev.users.map(u => u.id === updated.id ? updated : u)
      } : prev);
      setSelectedUser(updated);
      setIsModalOpen(false);
    } catch (err: any) {
      setPremiumError(err.message || 'Failed to update premium status');
    } finally {
      setIsPremiumLoading(false);
    }
  };

  const handlePointsAdjustment = async () => {
    if (!selectedUser || !pointsAmount) return;

    const amount = parseInt(pointsAmount);
    if (isNaN(amount) || amount <= 0) {
      setPointsError('Please enter a valid positive number');
      return;
    }

    setIsPointsLoading(true);
    setPointsError(null);
    try {
      // Calculate adjustment based on type (add or subtract)
      const adjustment = adjustmentType === 'add' ? amount : -amount;
      const defaultReason = adjustmentType === 'add'
        ? `Added ${amount} points by admin`
        : `Deducted ${amount} points by admin`;

      const result = await updateUserPoints(selectedUser.id, adjustment, pointsReason || defaultReason);

      // Update user points in the UI
      const currentPoints = selectedUser.points || 0;
      const newPoints = currentPoints + adjustment;
      const updatedUser = { ...selectedUser, points: newPoints };
      setUsersData((prev) => prev ? {
        ...prev,
        users: prev.users.map(u => u.id === selectedUser.id ? updatedUser : u)
      } : prev);
      setSelectedUser(updatedUser);

      // Reset form
      setPointsAmount('');
      setPointsReason('');
      setShowPointsForm(false);
      setAdjustmentType('add');
    } catch (err: any) {
      setPointsError(err.message || 'Failed to update points');
    } finally {
      setIsPointsLoading(false);
    }
  };

  return (
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <Switch
                checked={showBanned}
                onCheckedChange={setShowBanned}
                id="show-banned-switch"
              />
              <span className="text-sm text-gray-700">
                Show banned users
              </span>
            </label>
            
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-700">Premium filter:</label>
              <select
                value={showPremium === undefined ? 'all' : showPremium ? 'premium' : 'regular'}
                onChange={(e) => {
                  const value = e.target.value;
                  setShowPremium(value === 'all' ? undefined : value === 'premium');
                }}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Users</option>
                <option value="premium">Premium Only</option>
                <option value="regular">Regular Only</option>
              </select>
            </div>
          </div>
          <div className="w-64">
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
        </div>
        <div className="mb-4">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashbot Users</h1>
          <p className="text-gray-600 mb-4">Manage users of your Dashbot Telegram bot</p>
          <h2 className={`text-xl font-semibold ${showBanned ? 'text-red-600' : 'text-emerald-700'}`}>
            {showBanned ? 'Banned Users' : 'Current Users'}
            {showPremium === true && ' - Premium Only'}
            {showPremium === false && ' - Regular Only'}
          </h2>
        </div>

        {error && (
          <div className="bg-red-50 p-4 mb-6 rounded-md text-red-700">
            {error}
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Points
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Referral Code
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Active
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      Loading users...
                    </td>
                  </tr>
                ) : filteredUsers && filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {user.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 mr-4">
                            {user.photo_url ? (
                              <div className="relative h-10 w-10 rounded-full overflow-hidden">
                                <Image 
                                  src={user.photo_url} 
                                  alt={user.username || 'Profile picture'} 
                                  fill
                                  className="object-cover"
                                  sizes="40px"
                                />
                              </div>
                            ) : (
                              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center">
                                <span className="text-gray-500 font-medium text-sm">
                                  {(user.first_name?.[0] || user.username?.[0] || '?').toUpperCase()}
                                </span>
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                {user.username || 'No username'}
                              </span>
                              {user.is_premium && (
                                <Star className="w-4 h-4 text-amber-500 fill-current"  />
                              )}
                            </div>
                            <div className="text-sm text-gray-500">
                              {[user.first_name, user.last_name].filter(Boolean).join(' ') || 'Anonymous'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          {user.is_premium ? (
                            <>
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 mb-1">
                                <Star className="w-3 h-3 mr-1 fill-current" />
                                Premium
                              </span>
                              {user.premium_until && (
                                <span className="text-xs text-gray-500">
                                  Until {new Date(user.premium_until).toLocaleDateString()}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              Regular
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 font-medium">{user.points || 0}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user.referral_code}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {user.last_active ? formatDistanceToNow(new Date(user.last_active), { addSuffix: true }) : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          className="text-indigo-600 hover:text-indigo-900 mr-4"
                          onClick={() => {
                            setSelectedUser(user);
                            setIsModalOpen(true);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {usersData && usersData.pagination && (
            <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
              <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{((currentPage - 1) * usersData.pagination.limit) + 1}</span> to{' '}
                    <span className="font-medium">
                      {Math.min(currentPage * usersData.pagination.limit, usersData.pagination.total)}
                    </span>{' '}
                    of <span className="font-medium">{usersData.pagination.total}</span> users
                  </p>
                </div>
                <div>
                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    
                    {Array.from({ length: Math.min(5, usersData.pagination.pages) }, (_, i) => {
                      let pageNum;
                      
                      if (usersData.pagination.pages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= usersData.pagination.pages - 2) {
                        pageNum = usersData.pagination.pages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <button
                          key={pageNum}
                          onClick={() => handlePageChange(pageNum)}
                          className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                            currentPage === pageNum
                              ? 'z-10 bg-indigo-50 border-indigo-500 text-indigo-600'
                              : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === usersData.pagination.pages}
                      className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>

          {/* User Actions Modal */}
          <Dialog open={isModalOpen} onClose={() => {
            setIsModalOpen(false);
            setShowPointsForm(false);
            setPointsAmount('');
            setPointsReason('');
            setPointsError(null);
            setBanError(null);
            setPremiumError(null);
            setAdjustmentType('add');
          }} className="fixed z-50 inset-0 overflow-y-auto">
            <div className="fixed inset-0 bg-black/40 transition-opacity" aria-hidden="true" />
            <div className="flex items-center justify-center min-h-screen px-4">
              <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-auto p-6 z-10 border border-gray-200">
                <button
                  onClick={() => {
                    setIsModalOpen(false);
                    setShowPointsForm(false);
                    setPointsAmount('');
                    setPointsReason('');
                    setPointsError(null);
                    setBanError(null);
                    setPremiumError(null);
                    setAdjustmentType('add');
                  }}
                  className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 focus:outline-none"
                  aria-label="Close"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <Dialog.Title className="text-xl font-bold mb-4 text-gray-900 text-center">
                  {showPointsForm ? 'Adjust User Balance' : 'User Actions'}
                </Dialog.Title>
                {selectedUser && (
                  <div className="mb-6">
                    <div className="flex items-center gap-4 mb-4">
                      {selectedUser.photo_url ? (
                        <Image src={selectedUser.photo_url} alt={selectedUser.username || 'Profile'} width={48} height={48} className="rounded-full object-cover border border-gray-200" />
                      ) : (
                        <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                          <span className="text-gray-500 font-medium text-lg">
                            {(selectedUser.first_name?.[0] || selectedUser.username?.[0] || '?').toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-gray-900 text-lg">{selectedUser.username || 'No username'}</div>
                        <div className="text-gray-500 text-sm">{[selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || 'Anonymous'}</div>
                        <div className="text-xs text-gray-400">ID: {selectedUser.id}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 mb-2">
                      <div className="text-sm text-gray-700">Points: <span className="font-semibold">{selectedUser.points || 0}</span></div>
                      <div className="text-sm text-gray-700">Referral Code: <span className="font-mono">{selectedUser.referral_code}</span></div>
                      {selectedUser.is_premium && (
                        <div className="flex items-center gap-1 text-sm text-amber-700">
                          <Star className="w-4 h-4 fill-current" />
                          <span className="font-semibold">Premium</span>
                          {selectedUser.premium_until && (
                            <span className="text-xs text-gray-500 ml-1">
                              (until {new Date(selectedUser.premium_until).toLocaleDateString()})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mb-1">Last Active: {selectedUser.last_active ? formatDistanceToNow(new Date(selectedUser.last_active), { addSuffix: true }) : 'Never'}</div>
                  </div>
                )}
                
                {/* Balance Adjustment Form */}
                {showPointsForm ? (
                  <div className="mb-6">
                    {pointsError && <div className="text-red-500 text-sm mb-3 text-center">{pointsError}</div>}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Type
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setAdjustmentType('add')}
                            className={`flex-1 px-4 py-2 rounded-lg font-semibold transition ${
                              adjustmentType === 'add'
                                ? 'bg-green-500 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            Add Points
                          </button>
                          <button
                            type="button"
                            onClick={() => setAdjustmentType('subtract')}
                            className={`flex-1 px-4 py-2 rounded-lg font-semibold transition ${
                              adjustmentType === 'subtract'
                                ? 'bg-red-500 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                          >
                            Subtract Points
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Amount
                        </label>
                        <input
                          type="number"
                          value={pointsAmount}
                          onChange={(e) => setPointsAmount(e.target.value)}
                          placeholder="Enter amount..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          min="1"
                        />
                        {selectedUser && pointsAmount && (
                          <p className="text-xs text-gray-500 mt-1">
                            Current: {selectedUser.points || 0} → New: {
                              adjustmentType === 'add'
                                ? (selectedUser.points || 0) + parseInt(pointsAmount || '0')
                                : (selectedUser.points || 0) - parseInt(pointsAmount || '0')
                            }
                          </p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Remark (reason for adjustment)
                        </label>
                        <textarea
                          value={pointsReason}
                          onChange={(e) => setPointsReason(e.target.value)}
                          placeholder="e.g., Manual adjustment, Compensation, Refund..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                          rows={3}
                        />
                      </div>
                      <div className="flex gap-3">
                        <button
                          onClick={handlePointsAdjustment}
                          disabled={isPointsLoading || pointsAmount === ''}
                          className={`flex-1 ${
                            adjustmentType === 'add' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                          } disabled:bg-gray-300 text-white px-4 py-2 rounded-lg font-semibold transition flex items-center justify-center gap-2`}
                        >
                          {isPointsLoading ? 'Processing...' : adjustmentType === 'add' ? 'Add Points' : 'Subtract Points'}
                        </button>
                      </div>
                      <button
                        onClick={() => {
                          setShowPointsForm(false);
                          setPointsAmount('');
                          setPointsReason('');
                          setPointsError(null);
                          setAdjustmentType('add');
                        }}
                        className="w-full bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {banError && <div className="text-red-500 text-sm mb-2 text-center">{banError}</div>}
                    {premiumError && <div className="text-red-500 text-sm mb-2 text-center">{premiumError}</div>}
                    <div className="flex flex-col gap-3">
                      <button
                        className="w-full bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-semibold transition"
                        onClick={() => setShowPointsForm(true)}
                      >
                        Adjust User Balance
                      </button>
                      <button
                        className={`w-full px-4 py-2 rounded-lg font-semibold transition ${selectedUser?.is_premium ? 'bg-gray-500 hover:bg-gray-600' : 'bg-amber-500 hover:bg-amber-600'} text-white`}
                        onClick={handlePremiumToggle}
                        disabled={isPremiumLoading}
                      >
                        {isPremiumLoading
                          ? (selectedUser?.is_premium ? 'Disabling Premium...' : 'Enabling Premium...')
                          : (selectedUser?.is_premium ? 'Disable Premium' : 'Enable Premium')}
                      </button>
                      <button
                        className={`w-full px-4 py-2 rounded-lg font-semibold transition ${selectedUser?.is_banned ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'} text-white`}
                        onClick={handleBanToggle}
                        disabled={isBanLoading}
                      >
                        {isBanLoading
                          ? (selectedUser?.is_banned ? 'Unbanning...' : 'Banning...')
                          : (selectedUser?.is_banned ? 'Unban' : 'Ban')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </Dialog>
      </div>
  );
} 