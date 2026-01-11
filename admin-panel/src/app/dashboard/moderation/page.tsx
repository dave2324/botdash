'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createScheduledPost,
  deleteScheduledPost,
  getBotChats,
  BotChat,
  getGlobalModeration,
  getModerationSettings,
  upsertModerationSetting,
  ModerationSetting,
  getScheduledPosts,
  ScheduledPost,
  uploadFile,
} from '@/lib/api';

export default function ModerationPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Destination for moderation settings (per chat)
  const [modChatDest, setModChatDest] = useState('');
  const [modSettingsMap, setModSettingsMap] = useState<Record<number, ModerationSetting>>({});

  const [enabled, setEnabled] = useState(true);
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeText, setWelcomeText] = useState('');
  const [deleteLinks, setDeleteLinks] = useState(true);
  const [autoMute, setAutoMute] = useState(false);
  const [autoMuteSeconds, setAutoMuteSeconds] = useState(3600);

  const [posts, setPosts] = useState<ScheduledPost[]>([]);

  const [botChats, setBotChats] = useState<BotChat[]>([]);

  // Schedule form (choose destination, no manual chat_id)
  const [scheduleDest, setScheduleDest] = useState('');
  const [scheduleType, setScheduleType] = useState<'text' | 'photo' | 'video'>('text');
  const [scheduleText, setScheduleText] = useState('');

  const [scheduleMediaUrl, setScheduleMediaUrl] = useState('');
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaFileInputRef = useRef<HTMLInputElement | null>(null);
  // HTML datetime-local uses: "YYYY-MM-DDTHH:mm" (local time)
  const [scheduleAt, setScheduleAt] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const g = await getGlobalModeration();
      const c = g.config || {};

      // Global defaults (used if a chat doesn't have per-chat override yet)
      setEnabled(c.enabled !== false);
      setWelcomeEnabled(!!c.welcome_enabled);
      setWelcomeText(String(c.welcome_text || ''));
      setDeleteLinks(!!c.delete_links_enabled);
      setAutoMute(!!c.auto_mute_enabled);
      setAutoMuteSeconds(Number(c.auto_mute_seconds || 3600));

      const [p, chats, perChat] = await Promise.all([getScheduledPosts(), getBotChats(), getModerationSettings()]);
      setPosts(p.posts || []);

      const filteredChats = (chats.chats || []).filter((x) => x.chat_type === 'group' || x.chat_type === 'supergroup' || x.chat_type === 'channel');
      setBotChats(filteredChats);

      const m: Record<number, ModerationSetting> = {};
      for (const s of perChat.settings || []) m[Number(s.chat_id)] = s;
      setModSettingsMap(m);

      // Pick first chat by default
      if (!modChatDest && filteredChats.length > 0) {
        const c0 = filteredChats[0];
        setModChatDest(`${c0.chat_id}:${c0.chat_type}`);
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.response?.data?.message || e?.message || 'Failed to load' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When destination chat changes, load its override (or fall back to global values in state).
  useEffect(() => {
    if (!modChatDest) return;
    const [chatIdRaw] = modChatDest.split(':');
    const chatId = Number(chatIdRaw);
    if (!chatId) return;

    const s = modSettingsMap[chatId];
    if (!s) return;

    setEnabled(s.enabled !== false);
    setWelcomeEnabled(!!s.welcome_enabled);
    setWelcomeText(String(s.welcome_text || ''));
    setDeleteLinks(!!s.delete_links_enabled);
    setAutoMute(!!s.auto_mute_enabled);
    setAutoMuteSeconds(Number(s.auto_mute_seconds || 3600));
  }, [modChatDest, modSettingsMap]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Group / Channel Management</h1>
      <p className="text-sm text-gray-500 mt-1">Choose a destination chat to enable/disable moderation and configure rules for that chat.</p>

      {msg && (
        <div className={`mt-4 p-3 rounded ${msg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="p-4 rounded-lg bg-white shadow-sm border">
          <h2 className="font-semibold">Moderation Settings</h2>

          <div className="grid gap-2 mt-3">
            <select className="px-3 py-2 border rounded" value={modChatDest} onChange={(e) => setModChatDest(e.target.value)}>
              <option value="">Select destination…</option>
              {botChats.map((c) => {
                const label = c.title || (c.username ? `@${c.username}` : `${c.chat_type} ${c.chat_id}`);
                const value = `${c.chat_id}:${c.chat_type}`;
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enable moderation (selected chat)
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={welcomeEnabled} onChange={(e) => setWelcomeEnabled(e.target.checked)} />
              Welcome new members (send in group)
            </label>
            <textarea className="px-3 py-2 border rounded" rows={3} value={welcomeText} onChange={(e) => setWelcomeText(e.target.value)} placeholder="Welcome text (HTML allowed)" />

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={deleteLinks} onChange={(e) => setDeleteLinks(e.target.checked)} />
              Delete any link
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoMute} onChange={(e) => setAutoMute(e.target.checked)} />
              Auto-mute user who posts link
            </label>
            <input className="px-3 py-2 border rounded" type="number" value={autoMuteSeconds} onChange={(e) => setAutoMuteSeconds(Number(e.target.value))} placeholder="Mute seconds" />

            <button
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={async () => {
                try {
                  if (!modChatDest) return setMsg({ type: 'error', text: 'Select destination chat first' });

                  const [chatIdRaw, chatTypeRaw] = modChatDest.split(':');
                  const chatId = Number(chatIdRaw);
                  const chatType = (chatTypeRaw || 'group') as any;
                  if (!chatId) return setMsg({ type: 'error', text: 'Invalid destination chat' });

                  const r = await upsertModerationSetting(chatId, {
                    chat_type: chatType,
                    enabled,
                    welcome_enabled: welcomeEnabled,
                    welcome_text: welcomeText,
                    delete_links_enabled: deleteLinks,
                    auto_mute_enabled: autoMute,
                    auto_mute_seconds: autoMuteSeconds,
                  });

                  setModSettingsMap((prev) => ({ ...prev, [chatId]: r.setting }));
                  setMsg({ type: 'success', text: 'Saved for selected chat' });
                } catch (e: any) {
                  setMsg({ type: 'error', text: e?.response?.data?.message || e?.message || 'Save failed' });
                }
              }}
            >
              Save
            </button>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            Note: bot must be admin in the group/channel to delete messages or mute users.
          </div>
        </div>

        <div className="p-4 rounded-lg bg-white shadow-sm border">
          <h2 className="font-semibold">Scheduled Posts</h2>
          <div className="text-xs text-gray-500 mt-1">Select a destination chat where the bot is admin.</div>

          <div className="grid gap-2 mt-3">
            <select className="px-3 py-2 border rounded" value={scheduleDest} onChange={(e) => setScheduleDest(e.target.value)}>
              <option value="">Select destination…</option>
              {botChats.map((c) => {
                const label = c.title || (c.username ? `@${c.username}` : `${c.chat_type} ${c.chat_id}`);
                const value = `${c.chat_id}:${c.chat_type}`;
                return (
                  <option key={value} value={value}>
                    {label}
                  </option>
                );
              })}
            </select>
            <select
              className="px-3 py-2 border rounded"
              value={scheduleType}
              onChange={(e) => {
                const v = e.target.value as any;
                setScheduleType(v);
                if (v === 'text') setScheduleMediaUrl('');
              }}
            >
              <option value="text">text</option>
              <option value="photo">photo</option>
              <option value="video">video</option>
            </select>
            <textarea className="px-3 py-2 border rounded" rows={3} value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} placeholder="Text / Caption" />

            {(scheduleType === 'photo' || scheduleType === 'video') && (
              <div className="grid gap-2">
                {/* Hidden input: Upload button triggers this */}
                <input
                  ref={mediaFileInputRef}
                  type="file"
                  hidden
                  accept={scheduleType === 'photo' ? 'image/*' : 'video/*'}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    // allow selecting same file again later
                    e.target.value = '';
                    if (!f) return;
                    try {
                      setUploadingMedia(true);
                      const r = await uploadFile(f, 'scheduled-posts');
                      setScheduleMediaUrl(r.url);
                      setMsg({ type: 'success', text: 'Media uploaded successfully.' });
                    } catch (err: any) {
                      setMsg({ type: 'error', text: err?.message || 'Upload failed' });
                    } finally {
                      setUploadingMedia(false);
                    }
                  }}
                />

                <div className="flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-2 rounded border"
                    disabled={uploadingMedia}
                    onClick={() => mediaFileInputRef.current?.click()}
                  >
                    {uploadingMedia ? 'Uploading…' : 'Upload'}
                  </button>

                  <input
                    className="flex-1 px-3 py-2 border rounded"
                    value={scheduleMediaUrl}
                    onChange={(e) => setScheduleMediaUrl(e.target.value)}
                    placeholder="Or paste Media URL"
                  />
                </div>

                {scheduleMediaUrl && <div className="text-xs text-gray-500">Using: {scheduleMediaUrl}</div>}
              </div>
            )}

            <input
              type="datetime-local"
              className="px-3 py-2 border rounded"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
            />

            <button
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              disabled={uploadingMedia}
              onClick={async () => {
                try {
                  if (!scheduleDest) return setMsg({ type: 'error', text: 'Destination chat required' });
                  if (!scheduleAt) return setMsg({ type: 'error', text: 'Send time required' });

                  const [chatIdRaw, chatTypeRaw] = scheduleDest.split(':');
                  const chatId = Number(chatIdRaw);
                  const chatType = (chatTypeRaw || 'group') as any;
                  if (!chatId) return setMsg({ type: 'error', text: 'Invalid destination chat' });

                  // Convert local datetime-local input into an ISO timestamp for the backend.
                  const sendAtDate = new Date(scheduleAt);
                  if (Number.isNaN(sendAtDate.getTime())) return setMsg({ type: 'error', text: 'Invalid send time' });
                  const sendAtIso = sendAtDate.toISOString();

                  if ((scheduleType === 'photo' || scheduleType === 'video') && !scheduleMediaUrl) {
                    return setMsg({ type: 'error', text: 'Please upload a file (Upload button) or paste a Media URL.' });
                  }

                  await createScheduledPost({
                    chat_id: chatId,
                    chat_type: chatType,
                    content_type: scheduleType,
                    text: scheduleText,
                    media_url: scheduleMediaUrl || undefined,
                    send_at: sendAtIso,
                  });
                  setMsg({ type: 'success', text: 'Scheduled' });
                  await load();
                } catch (e: any) {
                  setMsg({ type: 'error', text: e?.response?.data?.message || e?.message || 'Schedule failed' });
                }
              }}
            >
              Create Schedule
            </button>
          </div>

          <div className="mt-4">
            <h3 className="font-medium">Jobs</h3>
            <div className="mt-2 space-y-2 text-sm">
              {posts.map((p) => (
                <div key={p.id} className="border rounded p-2">
                  <div className="font-medium">#{p.id} → {p.chat_id} ({p.chat_type}) [{p.status}]</div>
                  <div className="text-xs">{p.content_type} | {p.send_at}</div>
                  {p.error && <div className="text-xs text-red-600">{p.error}</div>}
                  <button
                    className="mt-2 px-3 py-1 border rounded text-red-600"
                    onClick={async () => {
                      await deleteScheduledPost(p.id);
                      await load();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
              {posts.length === 0 && <div className="text-xs text-gray-400">No jobs yet.</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button className="px-4 py-2 rounded border" onClick={load} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
}
