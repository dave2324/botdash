const express = require('express');
const pool = require('../config/database');
const { adminAuth } = require('./auth');
const { createBot } = require('../bot');

const router = express.Router();

// List conversations
router.get('/conversations', adminAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10) || 50, 200);
    const result = await pool.query(
      `SELECT c.*, tu.username, tu.first_name, tu.last_name
       FROM conversations c
       LEFT JOIN telegram_users tu ON tu.id = c.user_id
       ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get messages for a conversation
router.get('/conversations/:id/messages', adminAuth, async (req, res) => {
  try {
    const conversationId = parseInt(req.params.id, 10);
    const limit = Math.min(parseInt(req.query.limit || '100', 10) || 100, 500);

    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1', [conversationId]);
    if (!conv.rows.length) return res.status(404).json({ message: 'Conversation not found' });

    const result = await pool.query(
      `SELECT *
       FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [conversationId, limit]
    );

    res.json({ conversation: conv.rows[0], messages: result.rows });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reply to a conversation (text + optional media)
// IMPORTANT: This endpoint is idempotent (via idempotency_key) to prevent duplicate Telegram sends.
router.post('/conversations/:id/reply', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const conversationId = parseInt(req.params.id, 10);
    const {
      text,
      parse_mode = 'HTML',
      media_type,
      media_url,
      reply_to_message_id,
      idempotency_key,
    } = req.body || {};

    const hasText = typeof text === 'string' && text.trim().length > 0;
    const hasMedia =
      typeof media_url === 'string' &&
      media_url.trim().length > 0 &&
      typeof media_type === 'string' &&
      media_type.trim().length > 0;

    if (!hasText && !hasMedia) {
      return res.status(400).json({ message: 'Provide text and/or media_url with media_type' });
    }

    if (!idempotency_key || typeof idempotency_key !== 'string' || !idempotency_key.trim()) {
      return res.status(400).json({ message: 'Missing idempotency_key' });
    }

    await client.query('BEGIN');

    const convRes = await client.query('SELECT * FROM conversations WHERE id = $1 FOR UPDATE', [conversationId]);
    if (!convRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const conversation = convRes.rows[0];
    const chatId = conversation.telegram_chat_id;

    // Reserve this idempotency key inside the transaction.
    // If the same request is retried, this insert will conflict and we will not send again.
    let reservedMessageId;
    try {
      const reserveRes = await client.query(
        `INSERT INTO conversation_messages (
            conversation_id,
            direction,
            telegram_message_id,
            telegram_reply_to_message_id,
            sender_telegram_user_id,
            type,
            text,
            payload,
            idempotency_key
          )
          VALUES ($1, 'outbound', NULL, $2, NULL, $3, $4, $5::jsonb, $6)
          RETURNING id`,
        [
          conversationId,
          reply_to_message_id || null,
          hasMedia ? String(media_type) : 'text',
          hasText ? String(text) : null,
          hasMedia
            ? JSON.stringify({ media_type: String(media_type), media_url: String(media_url) })
            : JSON.stringify({}),
          idempotency_key.trim(),
        ]
      );
      reservedMessageId = reserveRes.rows[0]?.id;
    } catch (e) {
      // Unique violation => this exact request was already processed.
      if (e && e.code === '23505') {
        await client.query('COMMIT');
        return res.json({ ok: true, duplicate: true });
      }
      throw e;
    }

    const botInstance = await createBot();
    if (!botInstance || !botInstance.bot) throw new Error('Bot not ready');

    let sent;
    const opts = { parse_mode };

    if (hasMedia) {
      const caption = hasText ? String(text) : undefined;
      if (media_type === 'photo') sent = await botInstance.bot.sendPhoto(chatId, media_url, { ...opts, caption });
      else if (media_type === 'video') sent = await botInstance.bot.sendVideo(chatId, media_url, { ...opts, caption });
      else if (media_type === 'audio') sent = await botInstance.bot.sendAudio(chatId, media_url, { ...opts, caption });
      else if (media_type === 'voice') sent = await botInstance.bot.sendVoice(chatId, media_url, { ...opts, caption });
      else if (media_type === 'document') sent = await botInstance.bot.sendDocument(chatId, media_url, { ...opts, caption });
      else return res.status(400).json({ message: 'Unsupported media_type. Use photo|video|audio|voice|document' });
    } else {
      sent = await botInstance.bot.sendMessage(chatId, String(text), opts);
    }

    // Best-effort: update the reserved row with Telegram IDs.
    if (reservedMessageId) {
      try {
        await client.query(
          `UPDATE conversation_messages
           SET telegram_message_id = $1,
               payload = CASE
                 WHEN payload IS NULL THEN $2::jsonb
                 ELSE payload || $2::jsonb
               END
           WHERE id = $3`,
          [sent?.message_id || null, JSON.stringify({ telegram_sent: true }), reservedMessageId]
        );
      } catch (e) {
        console.warn('Failed to update reserved conversation_messages row after send:', e);
      }
    }

    await client.query('COMMIT');

    res.json({ ok: true, sent });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error replying to conversation:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
