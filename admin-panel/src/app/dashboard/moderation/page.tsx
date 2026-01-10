'use client';

import { useEffect, useState } from 'react';
import {
  createScheduledPost,
  deleteScheduledPost,
  getGlobalModeration,
  saveGlobalModeration,
  getScheduledPosts,
  ScheduledPost,
} from '@/lib/api';

export default function ModerationPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [welcomeEnabled, setWelcomeEnabled] = useState(false);
  const [welcomeText, setWelcomeText] = useState('');
  const [deleteLinks, setDeleteLinks] = useState(true);
  const [autoMute, setAutoMute] = useState(false);
  const [autoMuteSeconds, setAutoMuteSeconds] = useState(3600);

  const [posts, setPosts] = useState<ScheduledPost[]>([]);

  // Schedule form (still needs chat_id to know where to post)
  const [scheduleChatId, setScheduleChatId] = useState('');
  const [scheduleChatType, setScheduleChatType] = useState<'group' | 'supergroup' | 'channel'>('group');
  const [scheduleType, setScheduleType] = useState<'text' | 'photo' | 'video'>('text');
  const [scheduleText, setScheduleText] = useState('');
  const [scheduleMediaUrl, setScheduleMediaUrl] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const g = await getGlobalModeration();
      const c = g.config || {};
      setEnabled(c.enabled !== false);
      setWelcomeEnabled(!!c.welcome_enabled);
      setWelcomeText(String(c.welcome_text || ''));
      setDeleteLinks(!!c.delete_links_enabled);
      setAutoMute(!!c.auto_mute_enabled);
      setAutoMuteSeconds(Number(c.auto_mute_seconds || 3600));

      const p = await getScheduledPosts();
      setPosts(p.posts || []);
    } catch (e: any) {
      setMsg({ type: 'error', text: e?.response?.data?.message || e?.message || 'Failed to load' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Group / Channel Management</h1>
      <p className="text-sm text-gray-500 mt-1">Global moderation rules applied to ALL groups/channels where the bot is admin.</p>

      {msg && (
        <div className={`mt-4 p-3 rounded ${msg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {msg.text}
        </div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="p-4 rounded-lg bg-white shadow-sm border">
          <h2 className="font-semibold">Global Moderation Settings</h2>

          <div className="grid gap-2 mt-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enable moderation (all chats)
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
                  await saveGlobalModeration({
                    enabled,
                    welcome_enabled: welcomeEnabled,
                    welcome_text: welcomeText,
                    delete_links_enabled: deleteLinks,
                    auto_mute_enabled: autoMute,
                    auto_mute_seconds: autoMuteSeconds,
                  });
                  setMsg({ type: 'success', text: 'Saved' });
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
          <h2 className="font-semibold">Scheduled Posts (still needs chat_id)</h2>
          <div className="text-xs text-gray-500 mt-1">Scheduling always needs a target chat_id to know where to post.</div>

          <div className="grid gap-2 mt-3">
            <input className="px-3 py-2 border rounded" value={scheduleChatId} onChange={(e) => setScheduleChatId(e.target.value)} placeholder="Chat ID" />
            <select className="px-3 py-2 border rounded" value={scheduleChatType} onChange={(e) => setScheduleChatType(e.target.value as any)}>
              <option value="group">group</option>
              <option value="supergroup">supergroup</option>
              <option value="channel">channel</option>
            </select>
            <select className="px-3 py-2 border rounded" value={scheduleType} onChange={(e) => setScheduleType(e.target.value as any)}>
              <option value="text">text</option>
              <option value="photo">photo</option>
              <option value="video">video</option>
            </select>
            <textarea className="px-3 py-2 border rounded" rows={3} value={scheduleText} onChange={(e) => setScheduleText(e.target.value)} placeholder="Text / Caption" />
            <input className="px-3 py-2 border rounded" value={scheduleMediaUrl} onChange={(e) => setScheduleMediaUrl(e.target.value)} placeholder="Media URL (for photo/video)" />
            <input className="px-3 py-2 border rounded" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} placeholder="Send at (YYYY-MM-DD HH:MM:SS)" />

            <button
              className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
              onClick={async () => {
                try {
                  const id = Number(scheduleChatId);
                  if (!id) return setMsg({ type: 'error', text: 'Chat ID required for scheduling' });
                  if (!scheduleAt) return setMsg({ type: 'error', text: 'send_at required' });

                  await createScheduledPost({
                    chat_id: id,
                    chat_type: scheduleChatType,
                    content_type: scheduleType,
                    text: scheduleText,
                    media_url: scheduleMediaUrl || undefined,
                    send_at: scheduleAt,
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
