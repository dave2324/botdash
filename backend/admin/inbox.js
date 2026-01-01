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
router.post('/conversations/:id/reply', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const conversationId = parseInt(req.params.id, 10);
    const { text, parse_mode = 'HTML', media_type, media_url, reply_to_message_id } = req.body || {};

    const hasText = typeof text === 'string' && text.trim().length > 0;
    const hasMedia = typeof media_url === 'string' && media_url.trim().length > 0 && typeof media_type === 'string' && media_type.trim().length > 0;

    if (!hasText && !hasMedia) {
      return res.status(400).json({ message: 'Provide text and/or media_url with media_type' });
    }

    await client.query('BEGIN');

    const convRes = await client.query(
      'SELECT * FROM conversations WHERE id = $1 FOR UPDATE',
      [conversationId]
    );
    if (!convRes.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const conversation = convRes.rows[0];
    const chatId = conversation.telegram_chat_id;

    const botInstance = await createBot();
    if (!botInstance || !botInstance.bot) throw new Error('Bot not ready');

    let sent;
    const opts = { parse_mode, reply_to_message_id: reply_to_message_id || undefined };

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

    // Outbound messages will be logged by the bot wrapper in bot.js.
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
