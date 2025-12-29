const express = require('express');
const pool = require('../config/database');
const router = express.Router();

// Get public game settings - OPTIMIZED
router.get('/', async (req, res) => {
  try {
    // Single query with conditional aggregation
    const result = await pool.query(`
      SELECT 
        MAX(CASE WHEN key = 'points_on_spin_wheel_play' THEN value END) as spin_cost,
        MAX(CASE WHEN key = 'points_on_channel_join' THEN value END) as channel_join_points,
        MAX(CASE WHEN key = 'points_on_video_watch' THEN value END) as video_watch_points,
        MAX(CASE WHEN key = 'points_on_quiz_complete' THEN value END) as quiz_complete_points,
        MAX(CASE WHEN key = 'points_on_referral' THEN value END) as referral_points,
        MAX(CASE WHEN key = 'min_points_withdraw' THEN value END) as min_withdraw,
        MAX(CASE WHEN key = 'max_spin_wheel_plays_per_day' THEN value END) as max_spins,
        MAX(CASE WHEN key = 'max_math_quiz_plays_per_day' THEN value END) as max_quiz
      FROM settings 
      WHERE key IN (
        'points_on_spin_wheel_play',
        'points_on_channel_join',
        'points_on_video_watch',
        'points_on_quiz_complete',
        'points_on_referral',
        'min_points_withdraw',
        'max_spin_wheel_plays_per_day',
        'max_math_quiz_plays_per_day'
      )
    `);

    const data = result.rows[0];
    const settings = {
      spinWheel: {
        cost: data.spin_cost || 5,
        dailyLimit: data.max_spins || 5,
        maxPerDay: data.max_spins || 5
      },
      mathQuiz: {
        maxPerDay: data.max_quiz || 10
      },
      rewards: {
        channelJoin: data.channel_join_points || 30,
        videoWatch: data.video_watch_points || 20,
        quizComplete: data.quiz_complete_points || 50,
        referral: data.referral_points || 30
      },
      withdraw: {
        minPoints: data.min_withdraw || 1000
      }
    };

    // Cache for 5 minutes
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 