const express = require('express');
const { adminAuth } = require('./auth');
const pool = require('../config/database');

const router = express.Router();

// Global moderation config (applies to all groups/channels)
router.get('/global', adminAuth, async (req, res) => {
  try {
    const keys = [
      'moderation_enabled',
      'moderation_welcome_enabled',
      'moderation_welcome_text',
      'moderation_delete_links_enabled',
      'moderation_auto_mute_enabled',
      'moderation_auto_mute_seconds'
    ];
    const r = await pool.query('SELECT key, value FROM settings WHERE key = ANY($1::text[])', [keys]);
    const map = new Map(r.rows.map((x) => [x.key, String(x.value)]));

    res.json({
      config: {
        enabled: map.get('moderation_enabled') !== 'false',
        welcome_enabled: map.get('moderation_welcome_enabled') === 'true',
        welcome_text: map.get('moderation_welcome_text') || '',
        delete_links_enabled: map.get('moderation_delete_links_enabled') === 'true',
        auto_mute_enabled: map.get('moderation_auto_mute_enabled') === 'true',
        auto_mute_seconds: Number(map.get('moderation_auto_mute_seconds') || 3600)
      }
    });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Server error' });
  }
});

router.put('/global', adminAuth, async (req, res) => {
  const body = req.body || {};
  try {
    const pairs = [
      ['moderation_enabled', body.enabled ? 'true' : 'false'],
      ['moderation_welcome_enabled', body.welcome_enabled ? 'true' : 'false'],
      ['moderation_welcome_text', String(body.welcome_text || '')],
      ['moderation_delete_links_enabled', body.delete_links_enabled ? 'true' : 'false'],
      ['moderation_auto_mute_enabled', body.auto_mute_enabled ? 'true' : 'false'],
      ['moderation_auto_mute_seconds', String(body.auto_mute_seconds || 3600)],
    ];

    for (const [key, value] of pairs) {
      await pool.query(
        `INSERT INTO settings(key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Server error' });
  }
});

// List chats the bot has seen
router.get('/chats', adminAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM bot_chats ORDER BY last_seen_at DESC LIMIT 200');
    res.json({ chats: r.rows });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Server error' });
  }
});

// List moderation settings
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM chat_moderation_settings ORDER BY updated_at DESC');
    res.json({ settings: r.rows });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Server error' });
  }
});

// Upsert moderation settings for a chat
router.put('/settings/:chatId', adminAuth, async (req, res) => {
  const chatId = Number(req.params.chatId);
  const body = req.body || {};

  try {
    const {
      chat_type,
      enabled,
      welcome_enabled,
      welcome_text,
      delete_links_enabled,
      auto_mute_enabled,
      auto_mute_seconds,
    } = body;

    const r = await pool.query(
      `INSERT INTO chat_moderation_settings (
        chat_id, chat_type, enabled,
        welcome_enabled, welcome_text,
        delete_links_enabled,
        auto_mute_enabled, auto_mute_seconds,
        updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
      ON CONFLICT (chat_id) DO UPDATE SET
        chat_type=EXCLUDED.chat_type,
        enabled=EXCLUDED.enabled,
        welcome_enabled=EXCLUDED.welcome_enabled,
        welcome_text=EXCLUDED.welcome_text,
        delete_links_enabled=EXCLUDED.delete_links_enabled,
        auto_mute_enabled=EXCLUDED.auto_mute_enabled,
        auto_mute_seconds=EXCLUDED.auto_mute_seconds,
        updated_at=NOW()
      RETURNING *`,
      [
        chatId,
        String(chat_type || 'group'),
        enabled !== false,
        !!welcome_enabled,
        welcome_text || null,
        !!delete_links_enabled,
        !!auto_mute_enabled,
        Number(auto_mute_seconds || 3600),
      ]
    );

    res.json({ setting: r.rows[0] });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Server error' });
  }
});

// Scheduled posts
router.get('/scheduled-posts', adminAuth, async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM scheduled_posts ORDER BY send_at DESC');
    res.json({ posts: r.rows });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Server error' });
  }
});

router.post('/scheduled-posts', adminAuth, async (req, res) => {
  const body = req.body || {};
  try {
    const { chat_id, chat_type, content_type = 'text', text, media_url, send_at } = body;
    if (!chat_id || !send_at) return res.status(400).json({ message: 'chat_id and send_at required' });

    const r = await pool.query(
      `INSERT INTO scheduled_posts (chat_id, chat_type, content_type, text, media_url, send_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [Number(chat_id), String(chat_type || 'group'), String(content_type), text || null, media_url || null, send_at]
    );
    res.json({ post: r.rows[0] });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Server error' });
  }
});

router.delete('/scheduled-posts/:id', adminAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM scheduled_posts WHERE id=$1', [Number(req.params.id)]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e?.message || 'Server error' });
  }
});

module.exports = router;
