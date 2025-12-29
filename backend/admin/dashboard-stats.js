const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { adminAuth } = require('./auth');

// Get dashboard statistics and counts
router.get('/', adminAuth, async (req, res) => {
  try {
    // Get all counts in parallel for better performance
    const [
      promotionSubmissionsResult,
      userPromotionsResult,
      usersResult,
      quizzesResult,
      videoTasksResult,
      telegramChannelsResult,
      referralsResult,
      spinWheelRewardsResult
    ] = await Promise.all([
      // Promotion submissions counts
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'approved') as approved,
          COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
          COUNT(*) as total
        FROM promotion_submissions
      `),
      
      // User submitted promotions counts
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE status = 'approved') as approved,
          COUNT(*) FILTER (WHERE status = 'declined') as declined,
          COUNT(*) FILTER (WHERE status = 'active') as active,
          COUNT(*) as total
        FROM user_submitted_promotions
      `),
      
      // Users counts
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_banned = false) as active,
          COUNT(*) FILTER (WHERE is_banned = true) as banned,
          COUNT(*) as total
        FROM telegram_users
      `),
      
      // Quizzes counts
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE is_active = false) as inactive,
          COUNT(*) as total
        FROM quizzes
      `),
      
      // Video tasks counts
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE disabled = false AND (expires_at IS NULL OR expires_at > NOW())) as active,
          COUNT(*) FILTER (WHERE disabled = true OR (expires_at IS NOT NULL AND expires_at <= NOW())) as inactive,
          COUNT(*) as total
        FROM youtube_tasks
      `),
      
      // Telegram channels counts
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE disabled = false AND (expires_at IS NULL OR expires_at > NOW())) as active,
          COUNT(*) FILTER (WHERE disabled = true OR (expires_at IS NOT NULL AND expires_at <= NOW())) as inactive,
          COUNT(*) as total
        FROM telegram_channels
      `),
      
      // Referrals count
      pool.query('SELECT COUNT(*) as total FROM referrals'),
      
      // Spin wheel rewards count
      pool.query(`
        SELECT 
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE is_active = false) as inactive,
          COUNT(*) as total
        FROM spin_wheel_rewards
      `)
    ]);

    const stats = {
      promotionSubmissions: {
        pending: parseInt(promotionSubmissionsResult.rows[0].pending),
        approved: parseInt(promotionSubmissionsResult.rows[0].approved),
        rejected: parseInt(promotionSubmissionsResult.rows[0].rejected),
        total: parseInt(promotionSubmissionsResult.rows[0].total)
      },
      userPromotions: {
        pending: parseInt(userPromotionsResult.rows[0].pending),
        approved: parseInt(userPromotionsResult.rows[0].approved),
        declined: parseInt(userPromotionsResult.rows[0].declined),
        active: parseInt(userPromotionsResult.rows[0].active),
        total: parseInt(userPromotionsResult.rows[0].total)
      },
      users: {
        active: parseInt(usersResult.rows[0].active),
        banned: parseInt(usersResult.rows[0].banned),
        total: parseInt(usersResult.rows[0].total)
      },
      quizzes: {
        active: parseInt(quizzesResult.rows[0].active),
        inactive: parseInt(quizzesResult.rows[0].inactive),
        total: parseInt(quizzesResult.rows[0].total)
      },
      videoTasks: {
        active: parseInt(videoTasksResult.rows[0].active),
        inactive: parseInt(videoTasksResult.rows[0].inactive),
        total: parseInt(videoTasksResult.rows[0].total)
      },
      telegramChannels: {
        active: parseInt(telegramChannelsResult.rows[0].active),
        inactive: parseInt(telegramChannelsResult.rows[0].inactive),
        total: parseInt(telegramChannelsResult.rows[0].total)
      },
      referrals: {
        total: parseInt(referralsResult.rows[0].total)
      },
      spinWheelRewards: {
        active: parseInt(spinWheelRewardsResult.rows[0].active),
        inactive: parseInt(spinWheelRewardsResult.rows[0].inactive),
        total: parseInt(spinWheelRewardsResult.rows[0].total)
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
