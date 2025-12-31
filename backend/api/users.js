const express = require('express');
const pool = require('../config/database');
const { validateEmail } = require('../utils/validation');

const router = express.Router();

// GET /api/users/me - Get current user's profile - OPTIMIZED
router.get('/me', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Single optimized query
    const result = await pool.query(
      `SELECT 
        u.*,
        COALESCE(s.daily_spins_used, 0) as daily_spins_used,
        COALESCE(s.last_spin_at, '1970-01-01') as last_spin_at
      FROM telegram_users u
      LEFT JOIN (
        SELECT 
          user_id,
          COUNT(*) as daily_spins_used,
          MAX(created_at) as last_spin_at
        FROM spins
        WHERE created_at::date = CURRENT_DATE
        GROUP BY user_id
      ) s ON s.user_id = u.id
      WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Use res.json with proper caching headers
    res.set('Cache-Control', 'no-cache');
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/users/me/spins - Get user's spin history
router.get('/me/spins', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT * FROM spins 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [userId]
    );

    res.json({ spins: result.rows });
  } catch (error) {
    console.error('Error fetching spin history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/users/me/spin - Perform a spin - OPTIMIZED
router.post('/me/spin', async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    await client.query('BEGIN');

    // Single query to get all needed data with row locking
    const checkResult = await client.query(
      `WITH settings_data AS (
        SELECT 
          COALESCE(MAX(CASE WHEN key = 'max_spin_wheel_plays_per_day' THEN value::integer END), 5) as max_spins,
          COALESCE(ABS(MAX(CASE WHEN key = 'points_on_spin_wheel_play' THEN value::integer END)), 5) as spin_cost
        FROM settings
      ),
      user_data AS (
        SELECT points FROM telegram_users WHERE id = $1 FOR UPDATE
      ),
      spins_data AS (
        SELECT COUNT(*) as spins_used FROM spins 
        WHERE user_id = $1 AND created_at::date = CURRENT_DATE
      )
      SELECT 
        s.max_spins,
        s.spin_cost,
        u.points,
        sp.spins_used
      FROM settings_data s
      CROSS JOIN user_data u
      CROSS JOIN spins_data sp`,
      [userId]
    );

    const data = checkResult.rows[0];
    const { max_spins, spin_cost, points, spins_used } = data;

    // Validate limits
    if (spins_used >= max_spins) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Daily spin limit reached',
        spinsUsed: parseInt(spins_used),
        maxSpins: parseInt(max_spins)
      });
    }

    if (points < spin_cost) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        message: 'Not enough points',
        required: parseInt(spin_cost),
        current: parseInt(points)
      });
    }

    // Get the reward ID from the request body
    const { rewardId } = req.body;
    if (!rewardId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Reward ID is required' });
    }

    // Verify the reward exists and is active
    const rewardResult = await client.query(
      'SELECT id, label, points FROM spin_wheel_rewards WHERE id = $1 AND is_active = true',
      [rewardId]
    );

    if (rewardResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid or inactive reward' });
    }

    const selectedReward = rewardResult.rows[0];

    // Execute all updates in batch
    await Promise.all([
      // Deduct spin cost
      client.query('UPDATE telegram_users SET points = points - $1 WHERE id = $2', [spin_cost, userId]),
      // Add reward points
      selectedReward.points > 0 ? 
        client.query('UPDATE telegram_users SET points = points + $1 WHERE id = $2', [selectedReward.points, userId]) :
        Promise.resolve()
    ]);

    // Record the spin
    const spinResult = await client.query(
      `INSERT INTO spins (user_id, reward_id, result, points_awarded)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, selectedReward.id, selectedReward.label, selectedReward.points]
    );

    await client.query('COMMIT');

    res.json({
      spin: spinResult.rows[0],
      reward: selectedReward,
      spinsUsed: parseInt(spins_used) + 1,
      maxSpins: parseInt(max_spins)
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error performing spin:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// PUT /api/users/profile - Update user profile information
router.put('/profile', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { phone_number, email } = req.body;
    const updates = {};
    const params = [userId];
    const updateFields = [];

    // Validate and add phone number if provided
    if (phone_number !== undefined) {
      // Basic phone number validation - allowing +, digits, and optional whitespace
      const cleanPhoneNumber = phone_number.replace(/\s/g, '');
      if (cleanPhoneNumber && !/^(\+)?[0-9]{10,15}$/.test(cleanPhoneNumber)) {
        return res.status(400).json({ message: 'Invalid phone number format' });
      }
      
      updates.phone_number = cleanPhoneNumber;
      params.push(cleanPhoneNumber);
      updateFields.push(`phone_number = $${params.length}`);
    }

    // Validate and add email if provided
    if (email !== undefined) {
      if (email && !validateEmail(email)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
      
      updates.email = email;
      params.push(email);
      updateFields.push(`email = $${params.length}`);
    }

    // If no valid fields to update
    if (updateFields.length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    // Update the user profile
    const updateQuery = `
      UPDATE telegram_users 
      SET ${updateFields.join(', ')}, 
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, first_name, last_name, username, phone_number, email, updated_at
    `;

    const result = await pool.query(updateQuery, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'Profile updated successfully',
      user: result.rows[0]
    });
    
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router; 