'use client';

import { useState } from 'react';
import { uploadFile, broadcastMedia } from '@/lib/api';

export default function BroadcastPage() {
  const [message, setMessage] = useState<string>('');
  const [target, setTarget] = useState<'all' | 'premium' | 'non_banned'>('all');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Broadcast</h1>
      <p className="text-sm text-gray-500 mt-1">Send a message (and optional photo/video) to users.</p>

      {status && (
        <div className={`mt-4 p-3 rounded ${status.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {status.text}
        </div>
      )}

      <div className="mt-4 p-4 rounded-lg bg-white shadow-sm border grid gap-3">
        <div className="flex gap-2 items-center">
          <label className="text-sm font-medium">Target</label>
          <select className="px-3 py-2 border rounded" value={target} onChange={(e) => setTarget(e.target.value as any)}>
            <option value="all">All</option>
            <option value="premium">Premium</option>
            <option value="non_banned">Non-banned</option>
          </select>
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
          placeholder="Message (optional if sending media)"
        />

        <div className="flex gap-3 items-center">
          <select className="px-3 py-2 border rounded" value={mediaType} onChange={(e) => setMediaType(e.target.value as any)}>
            <option value="photo">Photo</option>
            <option value="video">Video</option>
          </select>

          <label className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 cursor-pointer">
            {uploading ? 'Uploading...' : 'Upload Media'}
            <input
              type="file"
              accept={mediaType === 'photo' ? 'image/*' : 'video/*'}
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  setUploading(true);
                  const up = await uploadFile(file, 'broadcast');
                  setMediaUrl(up.url);
                  setStatus({ type: 'success', text: 'Media uploaded' });
                } catch {
                  setStatus({ type: 'error', text: 'Media upload failed' });
                } finally {
                  setUploading(false);
                  e.currentTarget.value = '';
                }
              }}
            />
          </label>
        </div>

        <input
          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="Media URL (optional)"
        />

        <button
          className="px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white"
          onClick={async () => {
            try {
              const res = await broadcastMedia({
                message,
                media_type: mediaUrl ? mediaType : undefined,
                media_url: mediaUrl || undefined,
                target,
              });
              setStatus({ type: 'success', text: `Broadcast done. Sent=${res.sent}, Failed=${res.failed}` });
            } catch {
              setStatus({ type: 'error', text: 'Broadcast failed' });
            }
          }}
        >
          Send Broadcast
        </button>
      </div>
    </div>
  );
}
