'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
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
  const sendingRef = useRef(false);
  const sendQueueRef = useRef<
    Array<{
      conversationId: number;
      text: string;
      hasMedia: boolean;
      mediaType: string;
      url: string;
      mediaFileName: string;
      sig: string;
      optimisticId: number;
    }>
  >([]);
  const lastSendRef = useRef<{ sig: string; at: number } | null>(null);
  const cooldownUntilRef = useRef<number>(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [mediaType, setMediaType] = useState<string>('');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [mediaFileName, setMediaFileName] = useState<string>('');
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

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

  // Auto-scroll to the latest message when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, selectedId]);

  const handleUpload = async (file: File) => {
    const up = await uploadFile(file, 'inbox');
    setMediaUrl(up.url);
    setMediaFileName(file.name || '');

    if (file.type.startsWith('image/')) setMediaType('photo');
    else if (file.type.startsWith('video/')) setMediaType('video');
    else if (file.type.startsWith('audio/')) setMediaType('audio');
    else setMediaType('document');
  };

  const processSendQueue = async () => {
    if (sendingRef.current) return;
    if (!sendQueueRef.current.length) return;

    sendingRef.current = true;
    setSending(true);

    while (sendQueueRef.current.length) {
      const job = sendQueueRef.current.shift();
      if (!job) continue;

      try {
        const idempotencyKey = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

        await api.post(`/admin/inbox/conversations/${job.conversationId}/reply`, {
          text: job.text ? job.text : undefined,
          media_type: job.hasMedia ? job.mediaType : undefined,
          media_url: job.hasMedia ? job.url : undefined,
          parse_mode: 'HTML',
          idempotency_key: idempotencyKey,
        });

        lastSendRef.current = { sig: job.sig, at: Date.now() };
        cooldownUntilRef.current = Date.now() + 300;
      } catch (err) {
        // Remove optimistic message for failed job
        setMessages((prev) => prev.filter((m) => m.id !== job.optimisticId));
        console.error('Failed to send reply', err);
      }
    }

    setSending(false);
    sendingRef.current = false;

    // Refresh conversations list (for preview/last_message_at) but do NOT reload messages.
    // Messages are already appended optimistically; reloading can cause UI jumps/flicker.
    void loadConversations();
  };

  const sendReply = async (e?: MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();

    if (!selectedConversation) return;

    // Small cooldown to avoid accidental double-click spam
    if (Date.now() < cooldownUntilRef.current) return;

    const text = replyText.trim();
    const url = mediaUrl.trim();
    const hasMedia = !!url;
    if (!text && !hasMedia) return;

    const sig = `${selectedConversation.id}::${text}::${hasMedia ? `${mediaType}:${url}` : ''}`;
    const last = lastSendRef.current;
    if (last && last.sig === sig && Date.now() - last.at < 2500) return;

    // Optimistic message
    const optimisticId = -Date.now();
    const nowIso = new Date().toISOString();
    const optimisticMessage: ConversationMessage = {
      id: optimisticId,
      conversation_id: selectedConversation.id,
      direction: 'outbound',
      telegram_message_id: null,
      telegram_reply_to_message_id: null,
      sender_telegram_user_id: null,
      type: hasMedia ? mediaType || 'media' : 'text',
      text: text || null,
      file_id: null,
      file_unique_id: null,
      file_name: hasMedia ? (mediaFileName || null) : null,
      mime_type: null,
      file_size: null,
      media_duration: null,
      payload: hasMedia
        ? {
            media_type: mediaType,
            media_url: url,
          }
        : null,
      created_at: nowIso,
    };
    setMessages((prev) => [...prev, optimisticMessage]);

    // Enqueue send job
    sendQueueRef.current.push({
      conversationId: selectedConversation.id,
      text,
      hasMedia,
      mediaType,
      url,
      mediaFileName,
      sig,
      optimisticId,
    });

    // Clear composer immediately so admin can type next message
    setReplyText('');
    setMediaType('');
    setMediaUrl('');
    setMediaFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Process queue in background
    void processSendQueue();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Conversations list */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="p-3 border-b font-medium">users</div>
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
        <div className="bg-white border rounded-xl overflow-hidden lg:col-span-2 flex flex-col h-[70vh]">
          <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50/60">
            {selectedConversation ? (
              <div>
                <div className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                  <span>
                    {selectedConversation.username
                      ? `@${selectedConversation.username}`
                      : [selectedConversation.first_name, selectedConversation.last_name]
                          .filter(Boolean)
                          .join(' ') || `Chat ${selectedConversation.telegram_chat_id}`}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  Chat ID: {selectedConversation.telegram_chat_id}
                </div>
              </div>
            ) : (
              <span className="text-sm text-gray-500">Select a conversation to start chatting</span>
            )}
          </div>

          {/* Messages list */}
          <div className="flex-1 px-4 py-3 overflow-auto space-y-3 bg-gray-50">
            {loading && <div className="text-sm text-gray-500">Loading…</div>}

            {!loading && selectedConversation && messages.length === 0 && (
              <div className="text-sm text-gray-500">No messages yet.</div>
            )}

            {!loading && messages.map((m) => {
              const isOutbound = m.direction === 'outbound';
              return (
                <div
                  key={m.id}
                  className={`flex w-full ${isOutbound ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xl rounded-2xl px-3 py-2 shadow-sm border text-sm whitespace-pre-wrap break-words
                      ${isOutbound
                        ? 'bg-blue-600 text-white border-blue-600 rounded-br-md'
                        : 'bg-white text-gray-900 border-gray-200 rounded-bl-md'}`}
                  >
                    {m.text && (
                      <div className={`text-sm leading-relaxed ${isOutbound ? 'text-white' : 'text-gray-900'}`}>
                        {m.text}
                      </div>
                    )}

                    {(m.file_id || m.file_name) && (
                      <div className={`mt-2 text-[11px] ${isOutbound ? 'text-blue-100/90' : 'text-gray-500'}`}>
                        {m.file_name && (
                          <div>file_name: <span className="font-medium">{m.file_name}</span></div>
                        )}
                        {m.file_id && (
                          <div className="break-all font-mono opacity-80">file_id: {m.file_id}</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Scroll anchor */}
            <div ref={messagesEndRef} />
          </div>

          {/* Reply composer */}
          <div className="border-t bg-white/80 backdrop-blur-sm px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                rows={2}
                placeholder="Type a message…"
                className="flex-1 w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 disabled:bg-gray-100 resize-none"
                disabled={!selectedConversation}
              />

              {/* Attach button with icon */}
              <div className="flex flex-col items-center gap-1 text-[10px] text-gray-500">
                <label className="inline-flex items-center justify-center w-9 h-9 rounded-full border bg-gray-50 hover:bg-gray-100 cursor-pointer">
                  <svg
                    className="w-4 h-4 text-gray-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3 3 0 0 1 4.24 4.24L9.88 16.24a1 1 0 0 1-1.41-1.41L15.54 7.76" />
                  </svg>
                  <input
                    type="file"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUpload(f);
                    }}
                    disabled={!selectedConversation}
                  />
                </label>
                {mediaUrl && (() => {
                  const derivedFromUrl = mediaUrl.split('/').pop() || '';
                  const cleanFromUrl = derivedFromUrl.split('?')[0];
                  const baseName = mediaFileName || cleanFromUrl;
                  const label = baseName
                    ? `${baseName}${mediaType ? ` (${mediaType})` : ''}`
                    : (mediaType || 'media');

                  return (
                    <span className="max-w-[8rem] truncate" title={baseName || mediaUrl}>
                      {label}
                    </span>
                  );
                })()}
              </div>

              {/* Send button with icon */}
              <button
                type="button"
                onClick={sendReply}
                disabled={!selectedConversation || (!replyText.trim() && !mediaUrl.trim())}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className={`w-4 h-4 ${sending ? 'opacity-70' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
