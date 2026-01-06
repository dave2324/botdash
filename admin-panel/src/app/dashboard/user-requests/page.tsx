'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, RefreshCw, Send, Circle, CheckCircle2, Clock3 } from 'lucide-react';
import api, { UserRequest } from '@/lib/api';

function humanizeSource(source?: string) {
  const s = String(source || '').toLowerCase();
  if (s === 'callback_query') return 'Button Click';
  if (s === 'message') return 'Message';
  if (s === 'command') return 'Command';
  if (s === 'menu') return 'Menu';
  if (s === 'flow') return 'Flow';
  return source || 'Unknown';
}

function humanizeAction(action?: string) {
  const a = String(action || '').trim();
  if (!a) return '—';
  // flow callback examples
  if (a.startsWith('flowmulti:')) return 'Flow (multi-choice)';
  if (a.startsWith('flow:')) return 'Flow (choice)';
  if (a.startsWith('onb:')) return 'Onboarding';
  if (a.startsWith('topic:')) return 'Topic';
  if (a.startsWith('country:')) return 'Country';
  if (a.startsWith('lang:')) return 'Language';
  return a;
}

export default function UserRequestsPage() {
  const [statusFilter, setStatusFilter] = useState<'open' | 'in_progress' | 'closed' | 'all'>('open');
  const [items, setItems] = useState<UserRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<UserRequest | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const getStatusConfig = (status: 'open' | 'in_progress' | 'closed') => {
    switch (status) {
      case 'open':
        return {
          label: 'Open',
          className: 'bg-red-50 text-red-600 border-red-200',
          icon: Circle,
        };
      case 'in_progress':
        return {
          label: 'In progress',
          className: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: Clock3,
        };
      case 'closed':
        return {
          label: 'Closed',
          className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: CheckCircle2,
        };
      default:
        return {
          label: status,
          className: 'bg-gray-50 text-gray-600 border-gray-200',
          icon: Circle,
        };
    }
  };

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
    } catch (e: any) {
      console.error(e);
      setMessage({ type: 'error', text: e?.response?.data?.message || e?.message || 'Failed to send reply' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
            <MessageSquare className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">User Requests</h1>
            <p className="text-sm text-gray-500">Central inbox for support messages and inline button selections.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 justify-end">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm shadow-sm"
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
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 text-sm shadow-sm disabled:opacity-70"
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
          <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-800">{title}</div>
              <div className="text-xs text-gray-500">{items.length} request{items.length === 1 ? '' : 's'}</div>
            </div>
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
                    className={`w-full text-left px-4 py-3 transition-colors hover:bg-gray-50 ${
                      selected?.id === it.id ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-gray-900 truncate">
                            {(it.first_name || it.username || 'User')}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                            {humanizeSource(it.source)}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mt-1 line-clamp-2">{it.message}</div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <span>#{it.id}</span>
                            <span className="mx-1">•</span>
                            <span>{new Date(it.created_at).toLocaleString()}</span>
                          </span>
                        </div>
                      </div>
                      <div className="ml-2 flex flex-col items-end gap-1">
                        {(() => {
                          const cfg = getStatusConfig(it.status as 'open' | 'in_progress' | 'closed');
                          const Icon = cfg.icon;
                          return (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${cfg.className}`}
                            >
                              <Icon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white border rounded-xl p-4 shadow-sm sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-gray-800">Details</div>
              {selected && (
                (() => {
                  const cfg = getStatusConfig(selected.status as 'open' | 'in_progress' | 'closed');
                  const Icon = cfg.icon;
                  return (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${cfg.className}`}
                    >
                      <Icon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  );
                })()
              )}
            </div>
            {!selected ? (
              <div className="text-gray-500 text-sm">Select a request to view and reply.</div>
            ) : (
              <>
                <div className="text-sm">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center text-sm font-semibold text-blue-600">
                      {(selected.first_name?.[0] || selected.username?.[0] || 'U').toUpperCase()}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">
                        {(selected.first_name || selected.username || 'User')}
                      </div>
                      <div className="text-xs text-gray-500">Chat ID: {selected.telegram_chat_id}</div>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-gray-500">
                    <div>
                      <span className="font-medium text-gray-700">Request ID:</span> #{selected.id}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Created:</span> {new Date(selected.created_at).toLocaleString()}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Source:</span> {humanizeSource(selected.source)}
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Action:</span> {humanizeAction(selected.action_key)}
                    </div>
                  </div>

                  <div className="mt-4 p-3 rounded-lg bg-gray-50 text-gray-700 text-sm max-h-40 overflow-y-auto">
                    {selected.message}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => updateStatus(selected.id, 'open')}
                    className="px-3 py-1.5 rounded-full border text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Open
                  </button>
                  <button
                    onClick={() => updateStatus(selected.id, 'in_progress')}
                    className="px-3 py-1.5 rounded-full border text-xs font-medium text-amber-700 hover:bg-amber-50 border-amber-200"
                  >
                    In progress
                  </button>
                  <button
                    onClick={() => updateStatus(selected.id, 'closed')}
                    className="px-3 py-1.5 rounded-full border text-xs font-medium text-emerald-700 hover:bg-emerald-50 border-emerald-200"
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
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    placeholder="Type your reply..."
                  />

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={sendReply}
                    disabled={sending || !reply.trim()}
                    className="mt-2 w-full px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-2 text-sm shadow-sm disabled:opacity-50"
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
