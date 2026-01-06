const express = require('express');
const pool = require('../config/database');
const { adminAuth } = require('./auth');

const router = express.Router();

// List requests (optional status filter)
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;

    const params = [];
    let where = '';
    if (status) {
      params.push(status);
      where = `WHERE ur.status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT ur.*, tu.username, tu.first_name, tu.last_name
       FROM user_requests ur
       JOIN telegram_users tu ON tu.id = ur.user_id
       ${where}
       ORDER BY ur.created_at DESC
       LIMIT 500`,
      params
    );

    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Error fetching user requests:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update status
router.patch('/:id/status', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status } = req.body;

    if (!['open', 'in_progress', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const result = await pool.query(
      `UPDATE user_requests
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (!result.rows.length) return res.status(404).json({ message: 'Not found' });

    res.json({ request: result.rows[0] });
  } catch (error) {
    console.error('Error updating request status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reply to user (stores reply + sends Telegram DM)
router.post('/:id/reply', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const id = parseInt(req.params.id);
    const { message } = req.body;

    if (!message || !String(message).trim()) {
      return res.status(400).json({ message: 'Reply message is required' });
    }

    await client.query('BEGIN');

    const reqResult = await client.query(
      `SELECT ur.*
       FROM user_requests ur
       JOIN telegram_users tu ON tu.id = ur.user_id
       WHERE ur.id = $1
       FOR UPDATE`,
      [id]
    );

    if (!reqResult.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Not found' });
    }

    const requestRow = reqResult.rows[0];

    // send telegram DM (normal message, not a reply)
    const { createBot } = require('../bot');
    const botInstance = await createBot();
    if (!botInstance || !botInstance.bot) {
      throw new Error('Bot not ready');
    }

    try {
      await botInstance.bot.sendMessage(requestRow.telegram_chat_id, String(message));
    } catch (e) {
      throw new Error(`Telegram send failed: ${e?.message || e}`);
    }

    const updated = await client.query(
      `UPDATE user_requests
       SET admin_reply = $1,
           replied_by_admin_id = $2,
           replied_at = NOW(),
           status = 'closed',
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [String(message), req.admin?.id || null, id]
    );

    await client.query('COMMIT');
    res.json({ request: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error replying to user:', error);
    res.status(500).json({ message: error?.message || 'Server error' });
  } finally {
    client.release();
  }
});

module.exports = router;
