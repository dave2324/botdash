"use client";

import React, { useEffect, useState } from 'react';
import { getTelegramChannels, addTelegramChannel, editTelegramChannel, getTelegramChannel, TelegramChannel, ChannelJoin, deleteTelegramChannel } from '@/lib/api';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { AlertCircle, CheckCircle2, Loader2, Calendar, X, Clock, Trash2 } from 'lucide-react';
import TaskDependencySelector, { TaskDependencyValue, TaskType } from '@/components/TaskDependencySelector';

export default function TelegramChannelsPage() {
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [link, setLink] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [requirePremium, setRequirePremium] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editChannel, setEditChannel] = useState<TelegramChannel | null>(null);
  const [editDisabled, setEditDisabled] = useState(false);
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [editRequirePremium, setEditRequirePremium] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [deleteChannel, setDeleteChannel] = useState<TelegramChannel | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'list' | 'analytics'>('list');
  // Analytics tab state
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(null);
  const [analyticsChannel, setAnalyticsChannel] = useState<TelegramChannel | null>(null);
  const [analyticsJoins, setAnalyticsJoins] = useState<ChannelJoin[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);

  // Dependency state for add form
  const [addDependency, setAddDependency] = useState<TaskDependencyValue>({ id: null, type: '' });
  // Dependency state for edit form
  const [editDependency, setEditDependency] = useState<TaskDependencyValue>({ id: null, type: '' });

  const fetchChannels = async () => {
    setIsLoading(true);
    try {
      const res = await getTelegramChannels();
      setChannels(res.channels || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load channels');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchChannels(); }, []);

  // Fetch analytics for selected channel
  const fetchChannelAnalytics = async (id: number) => {
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    setAnalyticsChannel(null);
    setAnalyticsJoins([]);
    try {
      const res = await getTelegramChannel(id);
      setAnalyticsChannel(res.channel);
      setAnalyticsJoins(res.joins || []);
    } catch (e: any) {
      setAnalyticsError(e.message || 'Failed to load channel analytics');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // When selectedChannelId changes, fetch analytics
  useEffect(() => {
    if (activeTab === 'analytics' && selectedChannelId) {
      fetchChannelAnalytics(selectedChannelId);
    }
  }, [selectedChannelId, activeTab]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await addTelegramChannel(link, expiryDate || null, addDependency.id, addDependency.type, requirePremium);
      setLink('');
      setExpiryDate('');
      setRequirePremium(false);
      setAddDependency({ id: null, type: '' });
      setSuccess(result.message);
      fetchChannels();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Failed to add channel');
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (channel: TelegramChannel) => {
    setEditChannel(channel);
    setEditDisabled(channel.disabled);
    setEditExpiryDate(channel.expires_at ? new Date(channel.expires_at).toISOString().split('T')[0] : '');
    setEditRequirePremium(channel.require_premium || false);
    // Fix type assignment for linter
    let depType: TaskType | '' = '';
    if (channel.require_finish_task_type === 'quiz' || channel.require_finish_task_type === 'youtube_video' || channel.require_finish_task_type === 'channel_join') {
      depType = channel.require_finish_task_type;
    }
    setEditDependency({
      id: channel.require_finish_task_id || null,
      type: depType
    });
  };

  const closeEdit = () => {
    setEditChannel(null);
    setEditDisabled(false);
    setEditExpiryDate('');
    setEditRequirePremium(false);
    setEditDependency({ id: null, type: '' });
  };  const handleDelete = async () => {
    if (!deleteChannel) return;
    setDeleteLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await deleteTelegramChannel(deleteChannel.id);
      setSuccess(result.message);
      await fetchChannels();
      setDeleteChannel(null);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Failed to delete channel');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editChannel) return;
    setEditLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await editTelegramChannel(editChannel.id, { 
        disabled: editDisabled,
        expires_at: editExpiryDate || null,
        require_finish_task_id: editDependency.id,
        require_finish_task_type: editDependency.type,
        require_premium: editRequirePremium
      });
      setSuccess(result.message);
      await fetchChannels();
      closeEdit();
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Failed to edit channel');
    } finally {
      setEditLoading(false);
    }
  };



  // Clear expiry date
  const clearExpiryDate = () => {
    setExpiryDate('');
  };

  // Clear edit expiry date
  const clearEditExpiryDate = () => {
    setEditExpiryDate('');
  };

  // Format expiry date for display
  const formatExpiryDate = (date: string | null) => {
    if (!date) return 'Never';
    const expiryDate = new Date(date);
    const now = new Date();
    
    if (expiryDate < now) {
      return 'Expired';
    }
    
    return formatDistanceToNow(expiryDate, { addSuffix: true });
  };

  // Get status class for expiry date
  const getExpiryStatusClass = (date: string | null) => {
    if (!date) return 'text-gray-500';
    const expiryDate = new Date(date);
    const now = new Date();
    
    if (expiryDate < now) {
      return 'text-red-500';
    }
    
    // If expiring within 48 hours
    const hours = (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hours < 48) {
      return 'text-amber-500';
    }
    
    return 'text-green-500';
  };

  // Format expiry message
  const formatExpiryMessage = (dateStr: string) => {
    if (!dateStr) return '';
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  };

  return (
    <div className="p-6">
      {/* Tab Bar */}
      <div className="mb-6 flex gap-2">
        <button
          className={`px-5 py-2 rounded-full shadow font-medium text-sm transition-colors duration-150 focus:outline-none border-2 ${activeTab === 'list' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}
          onClick={() => setActiveTab('list')}
        >
          Channels List
        </button>
        <button
          className={`px-5 py-2 rounded-full shadow font-medium text-sm transition-colors duration-150 focus:outline-none border-2 ${activeTab === 'analytics' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'}`}
          onClick={() => setActiveTab('analytics')}
        >
          Channel Analytics
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'list' && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Telegram Channels</h1>
          </div>
          <form onSubmit={handleAdd} className="mb-6">
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Add Telegram Channel</h2>
              <div className="mb-4">
                <TaskDependencySelector
                  value={addDependency}
                  onChange={setAddDependency}
                  label="Unlock this channel after completing:"
                />
              </div>
              <div className="mb-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={requirePremium}
                    onChange={(e) => setRequirePremium(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Require Premium Membership</span>
                </label>
                <p className="mt-1 text-sm text-gray-500">
                  Only premium users will be able to access this channel.
                </p>
              </div>
              <div className="flex flex-col md:flex-row gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Channel Username or Link</label>
                  <input 
                    type="text" 
                    required 
                    value={link} 
                    onChange={e => setLink(e.target.value)} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md" 
                    placeholder="@username, https://t.me/username, invite link, or channel ID (e.g., -1002490210049)" 
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Make sure the bot is an admin of the channel before adding it.
                  </p>
                </div>
                <div className="w-full md:w-auto">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline-block w-4 h-4 mr-1" />
                    Expiry Date (Optional)
                  </label>
                  <div className="relative">
                    <input 
                      type="date" 
                      value={expiryDate} 
                      onChange={e => setExpiryDate(e.target.value)} 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md pr-10" 
                    />
                    {expiryDate && (
                      <button 
                        type="button"
                        onClick={clearExpiryDate}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  {expiryDate && (
                    <p className="mt-1 text-xs text-gray-500">
                      <Clock className="inline-block w-3 h-3 mr-1" />
                      Expires {formatExpiryMessage(expiryDate)}
                    </p>
                  )}
                </div>
                <button 
                  type="submit" 
                  disabled={adding} 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium min-w-[120px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Adding...
                    </>
                  ) : 'Add Channel'}
                </button>
              </div>
            </div>
          </form>

          {error && (
            <div className="mb-6 flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-md text-green-700">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p>{success}</p>
            </div>
          )}

          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Link</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Private</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disabled</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expires</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {isLoading ? (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-center text-gray-500">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading...
                        </div>
                      </td>
                    </tr>
                  ) : channels.length > 0 ? channels.map(channel => (
                    <tr key={channel.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{channel.id}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {channel.title || `@${channel.name}`}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 underline">
                        <a href={channel.link} target="_blank" rel="noopener noreferrer">{channel.link}</a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {channel.is_private ? 'Yes' : 'No'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{channel.disabled ? 'Yes' : 'No'}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${getExpiryStatusClass(channel.expires_at)}`}> 
                        <div className="flex items-center">
                          {channel.expires_at && <Clock className="w-3 h-3 mr-1" />}
                          {formatExpiryDate(channel.expires_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDistanceToNow(new Date(channel.created_at), { addSuffix: true })}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex gap-2">
                          <button 
                            className="text-indigo-600 hover:text-indigo-900" 
                            onClick={() => openEdit(channel)}
                          >
                            Edit
                          </button>
                          <button 
                            className="text-red-600 hover:text-red-900 flex items-center gap-1" 
                            onClick={() => setDeleteChannel(channel)}
                          >
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="px-6 py-4 text-center text-gray-500">No channels found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Edit Modal */}
          {editChannel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <form onSubmit={handleEditSave} className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
                <h2 className="text-xl font-bold mb-4">Edit Channel #{editChannel.id}</h2>
                <div className="mb-4">
                  <TaskDependencySelector
                    value={editDependency}
                    onChange={setEditDependency}
                    label="Unlock this channel after completing:"
                    excludeId={editChannel.id}
                    excludeType="channel_join"
                  />
                </div>
                <div className="mb-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={editRequirePremium}
                      onChange={(e) => setEditRequirePremium(e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Require Premium Membership</span>
                  </label>
                  <p className="mt-1 text-sm text-gray-500">
                    Only premium users will be able to access this channel.
                  </p>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Disabled</label>
                  <select 
                    value={editDisabled ? 'yes' : 'no'} 
                    onChange={e => setEditDisabled(e.target.value === 'yes')} 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Calendar className="inline-block w-4 h-4 mr-1" />
                    Expiry Date (Optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input 
                        type="date" 
                        value={editExpiryDate} 
                        onChange={e => setEditExpiryDate(e.target.value)} 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md pr-10" 
                      />
                      {editExpiryDate && (
                        <button 
                          type="button"
                          onClick={clearEditExpiryDate}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <button 
                      type="button" 
                      onClick={clearEditExpiryDate}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50"
                    >
                      Remove
                    </button>
                  </div>
                  {editExpiryDate && (
                    <p className="mt-1 text-xs text-gray-500">
                      <Clock className="inline-block w-3 h-3 mr-1" />
                      Channel will expire {formatExpiryMessage(editExpiryDate)}
                    </p>
                  )}
                  {!editExpiryDate && (
                    <p className="mt-1 text-xs text-gray-500">
                      Channel will never expire unless you set an expiry date
                    </p>
                  )}
                </div>
                <div className="flex gap-2 mt-4">
                  <button 
                    type="submit" 
                    disabled={editLoading} 
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2"
                  >
                    {editLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : 'Save'}
                  </button>
                  <button 
                    type="button" 
                    onClick={closeEdit} 
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Delete Confirmation Modal */}
          {deleteChannel && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
                <h2 className="text-xl font-bold mb-4 text-red-600">Delete Channel</h2>
                <p className="mb-4 text-gray-700">
                  Are you sure you want to delete <strong>@{deleteChannel.name}</strong>? 
                  This action cannot be undone.
                </p>
                <div className="flex gap-2 mt-4">
                  <button 
                    onClick={handleDelete}
                    disabled={deleteLoading} 
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleteLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => setDeleteChannel(null)} 
                    disabled={deleteLoading}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
      {activeTab === 'analytics' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-blue-900">Channel Analytics</h2>
          <div className="overflow-x-auto mb-6">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Join Count</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {channels.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-2 text-center text-gray-500">No channels found</td></tr>
                ) : channels.map(ch => (
                  <tr key={ch.id} className={selectedChannelId === ch.id ? 'bg-blue-50 border-l-4 border-blue-400' : ''}>
                    <td className="px-4 py-2 text-sm">{ch.id}</td>
                    <td className="px-4 py-2 text-sm">{ch.title || `@${ch.name}`}</td>
                    <td className="px-4 py-2 text-sm font-bold text-blue-700">{ch.join_count || 0}</td>
                    <td className="px-4 py-2 text-sm">
                      <button
                        className="text-blue-600 hover:text-blue-900 underline text-sm"
                        onClick={() => setSelectedChannelId(ch.id)}
                        disabled={analyticsLoading && selectedChannelId === ch.id}
                      >
                        View Joined Users
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {analyticsLoading && (
            <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading joined users...</div>
          )}
          {analyticsError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700">{analyticsError}</div>
          )}
          {analyticsChannel && (
            <div>
              <div className="mb-4">
                <div className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  {analyticsChannel.title || `@${analyticsChannel.name}`}
                  <span className="text-xs text-gray-500">({analyticsChannel.join_count || 0} joins)</span>
                </div>
                <div className="text-sm text-gray-600">Link: <a href={analyticsChannel.link} className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">{analyticsChannel.link}</a></div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined At</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {analyticsJoins.length === 0 ? (
                      <tr><td colSpan={2} className="px-4 py-2 text-center text-gray-500">No joins yet</td></tr>
                    ) : analyticsJoins.map((join, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 text-sm flex items-center gap-2">
                          {join.photo_url && <img src={join.photo_url} alt="" className="w-6 h-6 rounded-full" />}
                          <span>{join.first_name} {join.last_name || ''} {join.username && <span className="text-xs text-gray-400">@{join.username}</span>}</span>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-700">{formatDistanceToNow(new Date(join.joined_at), { addSuffix: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 