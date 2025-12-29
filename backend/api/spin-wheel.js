const express = require('express');
const pool = require('../config/database');
const router = express.Router();

// Get active spin wheel rewards for users - OPTIMIZED
router.get('/rewards', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, label, points, color, probability, position FROM spin_wheel_rewards WHERE is_active = TRUE ORDER BY position ASC'
    );
    
    // Cache for 10 minutes since rewards don't change often
    res.set('Cache-Control', 'public, max-age=600');
    res.json({ rewards: result.rows });
  } catch (error) {
    console.error('Error fetching spin wheel rewards:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Spin the wheel and get a reward
router.post('/spin', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Check if user exists and get their current points
    const userResult = await pool.query(
      'SELECT id, points FROM telegram_users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get spin cost from settings
    const settingsResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'points_on_spin_wheel_play'"
    );
    const spinCost = parseInt(settingsResult.rows[0]?.value) || 5;

    // Get active rewards with their probabilities
    const rewardsResult = await pool.query(
      'SELECT id, label, points, probability FROM spin_wheel_rewards WHERE is_active = TRUE ORDER BY position ASC'
    );

    if (rewardsResult.rows.length === 0) {
      return res.status(400).json({ message: 'No active rewards available' });
    }

    // Calculate total probability
    const totalProbability = rewardsResult.rows.reduce((sum, reward) => sum + (reward.probability || 1), 0);

    // Generate random number between 0 and total probability
    const random = Math.random() * totalProbability;

    // Select reward based on probability
    let currentSum = 0;
    let selectedReward = rewardsResult.rows[0]; // Default to first reward
    
    for (const reward of rewardsResult.rows) {
      currentSum += (reward.probability || 1);
      if (random <= currentSum) {
        selectedReward = reward;
        break;
      }
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get today's spins count inside the transaction and lock the rows
      const spinsResult = await client.query(
        'SELECT COUNT(*) as daily_spins_used FROM spins WHERE user_id = $1 AND created_at::date = CURRENT_DATE FOR UPDATE',
        [user_id]
      );
      const daily_spins_used = parseInt(spinsResult.rows[0].daily_spins_used, 10) || 0;

      // Get max spins per day from settings
      const maxSpinsResult = await client.query(
        "SELECT value FROM settings WHERE key = 'max_spin_wheel_plays_per_day'"
      );
      const maxSpins = parseInt(maxSpinsResult.rows[0]?.value) || 5;

      // Check if user has spins left
      if (daily_spins_used >= maxSpins) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Daily spin limit reached', spinsUsed: daily_spins_used, maxSpins });
      }

      // Check if user has enough points (re-check inside transaction)
      const userPointsResult = await client.query(
        'SELECT points FROM telegram_users WHERE id = $1 FOR UPDATE',
        [user_id]
      );
      const userPoints = userPointsResult.rows[0]?.points || 0;
      if (userPoints < spinCost) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Not enough points to spin' });
      }

      // Deduct spin cost
      await client.query(
        'SELECT add_points_to_user($1, $2)',
        [user_id, -spinCost]
      );

      // Record the spin
      const spinResult = await client.query(
        `INSERT INTO spins (user_id, reward_id, result, points_awarded, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id`,
        [user_id, selectedReward.id, selectedReward.label, selectedReward.points]
      );

      // Add reward points to user
      await client.query(
        'SELECT add_points_to_user($1, $2)',
        [user_id, selectedReward.points]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        reward: selectedReward,
        spin_id: spinResult.rows[0].id,
        spinsUsed: daily_spins_used + 1,
        maxSpins: maxSpins
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing spin:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's spin history
router.get('/history/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      `SELECT s.id, s.result, s.points_awarded, s.created_at,
              r.label, r.color
       FROM spins s
       JOIN spin_wheel_rewards r ON r.id = s.reward_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 10`,
      [user_id]
    );
    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error fetching spin history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 