'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, RefreshCw, Send } from 'lucide-react';
import api, { UserRequest } from '@/lib/api';

export default function UserRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<'open' | 'in_progress' | 'closed' | 'all'>('open');
  const [items, setItems] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserRequest | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      const res = await api.get('/admin/user-requests', { params });
      setItems(res.data.requests || []);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Failed to load requests' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const title = useMemo(() => {
    switch (statusFilter) {
      case 'open':
        return 'Open Requests';
      case 'in_progress':
        return 'In Progress';
      case 'closed':
        return 'Closed';
      default:
        return 'All Requests';
    }
  }, [statusFilter]);

  const updateStatus = async (id: number, status: 'open' | 'in_progress' | 'closed') => {
    try {
      await api.patch(`/admin/user-requests/${id}/status`, { status });
      setMessage({ type: 'success', text: 'Status updated' });
      await fetchData();
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Failed to update status' });
    }
  };

  const sendReply = async () => {
    if (!selected) return;
    try {
      setSending(true);
      await api.post(`/admin/user-requests/${selected.id}/reply`, { message: reply });
      setReply('');
      setMessage({ type: 'success', text: 'Reply sent to user' });
      await fetchData();
      setSelected(null);
    } catch (e) {
      console.error(e);
      setMessage({ type: 'error', text: 'Failed to send reply' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-6 w-6 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">User Requests</h1>
            <p className="text-sm text-gray-500">Inbox from /support and inline button selections.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-gray-300"
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="closed">Closed</option>
            <option value="all">All</option>
          </select>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchData}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 flex items-center gap-2"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </motion.button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-4 rounded-lg ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b text-sm font-medium text-gray-700">{title}</div>
            {loading ? (
              <div className="p-4 text-gray-500">Loading...</div>
            ) : items.length === 0 ? (
              <div className="p-4 text-gray-500">No requests.</div>
            ) : (
              <div className="divide-y">
                {items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => setSelected(it)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${selected?.id === it.id ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900">
                        {(it.first_name || it.username || 'User')} — <span className="text-gray-600">{it.source}</span>
                      </div>
                      <div className="text-xs text-gray-500">#{it.id} • {new Date(it.created_at).toLocaleString()}</div>
                    </div>
                    <div className="text-sm text-gray-700 mt-1 line-clamp-2">{it.message}</div>
                    <div className="text-xs text-gray-500 mt-1">Status: {it.status}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">Details</div>
            {!selected ? (
              <div className="text-gray-500 text-sm">Select a request to view and reply.</div>
            ) : (
              <>
                <div className="text-sm">
                  <div className="font-semibold text-gray-900">
                    {(selected.first_name || selected.username || 'User')} (chat: {selected.telegram_chat_id})
                  </div>
                  <div className="text-gray-600 mt-1">{selected.message}</div>
                  <div className="text-xs text-gray-500 mt-2">Action: {selected.action_key}</div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => updateStatus(selected.id, 'open')}
                    className="px-3 py-2 rounded-lg border text-sm"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => updateStatus(selected.id, 'in_progress')}
                    className="px-3 py-2 rounded-lg border text-sm"
                  >
                    In progress
                  </button>
                  <button
                    onClick={() => updateStatus(selected.id, 'closed')}
                    className="px-3 py-2 rounded-lg border text-sm"
                  >
                    Closed
                  </button>
                </div>

                <div className="mt-4">
                  <label className="text-xs text-gray-500">Reply (will be sent to user on Telegram)</label>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    rows={5}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Type your reply..."
                  />

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="mt-2 w-full px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    Send Reply
                  </motion.button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
