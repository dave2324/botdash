'use client';

import { useEffect, useMemo, useState } from 'react';
import { uploadFile } from '@/lib/api';
import api from '@/lib/api';

type Conversation = {
  id: number;
  user_id: number | null;
  telegram_chat_id: number;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  created_at: string;
  updated_at: string;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type ConversationMessage = {
  id: number;
  conversation_id: number;
  direction: 'inbound' | 'outbound' | string;
  telegram_message_id: number | null;
  telegram_reply_to_message_id: number | null;
  sender_telegram_user_id: number | null;
  type: string;
  text: string | null;
  file_id: string | null;
  file_unique_id: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  media_duration: number | null;
  payload: any;
  created_at: string;
};

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [mediaType, setMediaType] = useState<string>('');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [sending, setSending] = useState(false);

  const selectedConversation = useMemo(
    () => conversations.find(c => c.id === selectedId) || null,
    [conversations, selectedId]
  );

  const loadConversations = async () => {
    const res = await api.get('/admin/inbox/conversations?limit=100');
    setConversations(res.data.conversations || []);
  };

  const loadMessages = async (conversationId: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/admin/inbox/conversations/${conversationId}/messages?limit=500`);
      setMessages(res.data.messages || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
    const t = setInterval(loadConversations, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (selectedId) loadMessages(selectedId);
  }, [selectedId]);

  const handleUpload = async (file: File) => {
    const up = await uploadFile(file, 'inbox');
    setMediaUrl(up.url);

    if (file.type.startsWith('image/')) setMediaType('photo');
    else if (file.type.startsWith('video/')) setMediaType('video');
    else if (file.type.startsWith('audio/')) setMediaType('audio');
    else setMediaType('document');
  };

  const sendReply = async () => {
    if (!selectedConversation) return;
    if (!replyText.trim() && !mediaUrl.trim()) return;

    setSending(true);
    try {
      const lastInbound = [...messages].reverse().find(m => m.direction === 'inbound');

      await api.post(`/admin/inbox/conversations/${selectedConversation.id}/reply`, {
        text: replyText.trim() ? replyText : undefined,
        media_type: mediaUrl ? mediaType : undefined,
        media_url: mediaUrl ? mediaUrl : undefined,
        reply_to_message_id: lastInbound?.telegram_message_id || undefined,
        parse_mode: 'HTML'
      });

      setReplyText('');
      setMediaType('');
      setMediaUrl('');

      await loadMessages(selectedConversation.id);
      await loadConversations();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <p className="text-sm text-gray-500">All user ↔ bot conversations. Reply with text or media.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversations list */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="p-3 border-b font-medium">Conversations</div>
          <div className="max-h-[70vh] overflow-auto">
            {conversations.map((c) => {
              const name = c.username
                ? `@${c.username}`
                : [c.first_name, c.last_name].filter(Boolean).join(' ') || `Chat ${c.telegram_chat_id}`;

              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-3 border-b hover:bg-gray-50 ${selectedId === c.id ? 'bg-gray-50' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-sm text-gray-900 truncate">{name}</div>
                    <div className="text-xs text-gray-400">{c.last_message_at ? new Date(c.last_message_at).toLocaleString() : ''}</div>
                  </div>
                  <div className="text-xs text-gray-500 truncate">{c.last_message_preview || ''}</div>
                </button>
              );
            })}

            {conversations.length === 0 && (
              <div className="p-4 text-sm text-gray-500">No conversations yet.</div>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="bg-white border rounded-lg overflow-hidden lg:col-span-2">
          <div className="p-3 border-b font-medium">
            {selectedConversation ? (
              <span>
                Chat: {selectedConversation.telegram_chat_id}
                {selectedConversation.username ? ` (@${selectedConversation.username})` : ''}
              </span>
            ) : (
              'Select a conversation'
            )}
          </div>

          <div className="p-4 max-h-[55vh] overflow-auto space-y-2">
            {loading && <div className="text-sm text-gray-500">Loading…</div>}

            {!loading && selectedConversation && messages.length === 0 && (
              <div className="text-sm text-gray-500">No messages yet.</div>
            )}

            {!loading && messages.map((m) => (
              <div
                key={m.id}
                className={`p-3 rounded border ${m.direction === 'outbound' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-medium text-gray-700">
                    {m.direction === 'outbound' ? 'Admin/Bot' : 'User'} • {m.type}
                  </div>
                  <div className="text-[11px] text-gray-400">{new Date(m.created_at).toLocaleString()}</div>
                </div>

                {m.text && <div className="text-sm text-gray-900 whitespace-pre-wrap">{m.text}</div>}

                {m.file_id && (
                  <div className="text-xs text-gray-600 mt-2">
                    file_id: <span className="font-mono break-all">{m.file_id}</span>
                  </div>
                )}

                {m.file_name && (
                  <div className="text-xs text-gray-600">file_name: {m.file_name}</div>
                )}
              </div>
            ))}
          </div>

          {/* Reply composer */}
          <div className="border-t p-4 space-y-2">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={3}
                placeholder="Type a reply… (links are ok)"
                className="md:col-span-2 w-full px-3 py-2 border rounded"
                disabled={!selectedConversation || sending}
              />

              <div className="space-y-2">
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUpload(f);
                  }}
                  disabled={!selectedConversation || sending}
                />

                <div className="text-xs text-gray-500">
                  {mediaUrl ? (
                    <div>
                      <div>media_type: <b>{mediaType}</b></div>
                      <div className="break-all">media_url: {mediaUrl}</div>
                    </div>
                  ) : (
                    'Optional: attach media'
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={sendReply}
                disabled={!selectedConversation || sending || (!replyText.trim() && !mediaUrl.trim())}
                className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
