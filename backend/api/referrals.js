const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// GET /api/user/referrals
router.get('/', async (req, res) => {
  try {
    // req.telegramUser is set by the auth middleware in index.js
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get users referred by this user
    const referralsResult = await pool.query(
      `SELECT r.id, r.created_at, r.points_awarded,
              u.id as user_id, u.username, u.first_name, u.last_name, u.photo_url
       FROM referrals r
       JOIN telegram_users u ON u.id = r.referred_id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    // Get total points earned from referrals
    const totalPointsResult = await pool.query(
      'SELECT COALESCE(SUM(points_awarded), 0) as total_points FROM referrals WHERE referrer_id = $1',
      [userId]
    );

    // Optionally: Get the referrer of the current user, including their referral_code
    const referrerResult = await pool.query(
      `SELECT referrer.id, referrer.username, referrer.first_name, referrer.last_name, referrer.referral_code
       FROM referrals r
       JOIN telegram_users referrer ON referrer.id = r.referrer_id
       WHERE r.referred_id = $1
       LIMIT 1`,
      [userId]
    );

    res.json({
      referrals: referralsResult.rows.map(r => ({
        id: r.user_id,
        username: r.username,
        first_name: r.first_name,
        last_name: r.last_name,
        photo_url: r.photo_url,
        points_awarded: r.points_awarded,
        created_at: r.created_at
      })),
      totalPoints: totalPointsResult.rows[0]?.total_points || 0,
      referrer: referrerResult.rows[0] || null
    });
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ message: 'Server error fetching referrals' });
  }
});

module.exports = router; 