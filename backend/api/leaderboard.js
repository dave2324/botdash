const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get leaderboards
router.get('/', async (req, res) => {
  try {
    const { type = 'earnings', limit = 10, user_id } = req.query;
    
    let query = '';
    let userQuery = '';
    
    switch (type) {
      case 'earnings':
        query = `
          SELECT 
            tu.id,
            tu.username,
            tu.first_name,
            tu.last_name,
            tu.photo_url,
            tu.points as total_earnings,
            tu.is_premium,
            tu.premium_until,
            ROW_NUMBER() OVER (ORDER BY tu.points DESC) as rank
          FROM telegram_users tu
          WHERE tu.is_banned = false
          ORDER BY tu.points DESC
          LIMIT $1
        `;
        
        if (user_id) {
          userQuery = `
            SELECT 
              tu.id,
              tu.username,
              tu.first_name,
              tu.last_name,
              tu.photo_url,
              tu.points as total_earnings,
              tu.is_premium,
              tu.premium_until,
              (SELECT COUNT(*) + 1 FROM telegram_users tu2 WHERE tu2.points > tu.points AND tu2.is_banned = false) as rank
            FROM telegram_users tu
            WHERE tu.id = $1 AND tu.is_banned = false
          `;
        }
        break;
        
      case 'tasks':
        query = `
          SELECT 
            tu.id,
            tu.username,
            tu.first_name,
            tu.last_name,
            tu.photo_url,
            us.completed_tasks_count as total_tasks,
            tu.is_premium,
            tu.premium_until,
            ROW_NUMBER() OVER (ORDER BY us.completed_tasks_count DESC) as rank
          FROM telegram_users tu
          JOIN user_statistics us ON tu.id = us.id
          WHERE tu.is_banned = false
          ORDER BY us.completed_tasks_count DESC
          LIMIT $1
        `;
        
        if (user_id) {
          userQuery = `
            SELECT 
              tu.id,
              tu.username,
              tu.first_name,
              tu.last_name,
              tu.photo_url,
              us.completed_tasks_count as total_tasks,
              tu.is_premium,
              tu.premium_until,
              (SELECT COUNT(*) + 1 FROM user_statistics us2 
               JOIN telegram_users tu2 ON us2.id = tu2.id 
               WHERE us2.completed_tasks_count > us.completed_tasks_count AND tu2.is_banned = false) as rank
            FROM telegram_users tu
            JOIN user_statistics us ON tu.id = us.id
            WHERE tu.id = $1 AND tu.is_banned = false
          `;
        }
        break;
        
      case 'checkins':
        query = `
          SELECT 
            tu.id,
            tu.username,
            tu.first_name,
            tu.last_name,
            tu.photo_url,
            COALESCE(MAX(dc.streak_count), 0) as max_streak,
            tu.is_premium,
            tu.premium_until,
            ROW_NUMBER() OVER (ORDER BY COALESCE(MAX(dc.streak_count), 0) DESC) as rank
          FROM telegram_users tu
          LEFT JOIN daily_checkins dc ON tu.id = dc.user_id
          WHERE tu.is_banned = false
          GROUP BY tu.id, tu.username, tu.first_name, tu.last_name, tu.photo_url, tu.is_premium, tu.premium_until
          ORDER BY max_streak DESC
          LIMIT $1
        `;
        
        if (user_id) {
          userQuery = `
            SELECT 
              tu.id,
              tu.username,
              tu.first_name,
              tu.last_name,
              tu.photo_url,
              COALESCE(MAX(dc.streak_count), 0) as max_streak,
              tu.is_premium,
              tu.premium_until,
              (SELECT COUNT(*) + 1 FROM (
                SELECT MAX(dc2.streak_count) as user_max_streak
                FROM telegram_users tu2
                LEFT JOIN daily_checkins dc2 ON tu2.id = dc2.user_id
                WHERE tu2.is_banned = false
                GROUP BY tu2.id
                HAVING COALESCE(MAX(dc2.streak_count), 0) > COALESCE(MAX(dc.streak_count), 0)
              ) ranked) as rank
            FROM telegram_users tu
            LEFT JOIN daily_checkins dc ON tu.id = dc.user_id
            WHERE tu.id = $1 AND tu.is_banned = false
            GROUP BY tu.id, tu.username, tu.first_name, tu.last_name, tu.photo_url, tu.is_premium, tu.premium_until
          `;
        }
        break;
        
      case 'affiliates':
        query = `
          SELECT 
            tu.id,
            tu.username,
            tu.first_name,
            tu.last_name,
            tu.photo_url,
            COUNT(ata.id) as total_completions,
            COALESCE(SUM(ata.points_awarded), 0) as total_points_earned,
            tu.is_premium,
            tu.premium_until,
            ROW_NUMBER() OVER (ORDER BY COUNT(ata.id) DESC, COALESCE(SUM(ata.points_awarded), 0) DESC) as rank
          FROM telegram_users tu
          LEFT JOIN affiliate_task_attempts ata ON tu.id = ata.user_id AND ata.status = 'completed'
          WHERE tu.is_banned = false
          GROUP BY tu.id, tu.username, tu.first_name, tu.last_name, tu.photo_url, tu.is_premium, tu.premium_until
          ORDER BY total_completions DESC, total_points_earned DESC
          LIMIT $1
        `;
        
        if (user_id) {
          userQuery = `
            SELECT 
              tu.id,
              tu.username,
              tu.first_name,
              tu.last_name,
              tu.photo_url,
              COUNT(ata.id) as total_completions,
              COALESCE(SUM(ata.points_awarded), 0) as total_points_earned,
              tu.is_premium,
              tu.premium_until,
              (SELECT COUNT(*) + 1 FROM (
                SELECT COUNT(ata2.id) as user_completions, COALESCE(SUM(ata2.points_awarded), 0) as user_points
                FROM telegram_users tu2
                LEFT JOIN affiliate_task_attempts ata2 ON tu2.id = ata2.user_id AND ata2.status = 'completed'
                WHERE tu2.is_banned = false
                GROUP BY tu2.id
                HAVING COUNT(ata2.id) > COUNT(ata.id) OR (COUNT(ata2.id) = COUNT(ata.id) AND COALESCE(SUM(ata2.points_awarded), 0) > COALESCE(SUM(ata.points_awarded), 0))
              ) ranked) as rank
            FROM telegram_users tu
            LEFT JOIN affiliate_task_attempts ata ON tu.id = ata.user_id AND ata.status = 'completed'
            WHERE tu.id = $1 AND tu.is_banned = false
            GROUP BY tu.id, tu.username, tu.first_name, tu.last_name, tu.photo_url, tu.is_premium, tu.premium_until
          `;
        }
        break;
        
      default:
        return res.status(400).json({ message: 'Invalid leaderboard type' });
    }
    
    // Get top users
    const topUsersResult = await pool.query(query, [limit]);
    
    // Get user's position if user_id provided
    let userPosition = null;
    if (user_id && userQuery) {
      const userResult = await pool.query(userQuery, [user_id]);
      userPosition = userResult.rows[0] || null;
    }
    
    // Add premium status check
    const leaderboard = topUsersResult.rows.map(user => ({
      ...user,
      is_premium_active: user.is_premium && user.premium_until && new Date(user.premium_until) > new Date()
    }));
    
    if (userPosition) {
      userPosition.is_premium_active = userPosition.is_premium && userPosition.premium_until && new Date(userPosition.premium_until) > new Date();
    }
    
    res.json({
      leaderboard,
      user_position: userPosition,
      type,
      total_shown: leaderboard.length
    });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get leaderboard types/categories
router.get('/types', async (req, res) => {
  try {
    const types = [
      {
        id: 'earnings',
        name: 'Top Earners',
        description: 'Users with highest total points',
        icon: '💰'
      },
      {
        id: 'tasks',
        name: 'Task Masters',
        description: 'Users with most completed tasks',
        icon: '✅'
      },
      {
        id: 'checkins',
        name: 'Check-in Champions',
        description: 'Users with longest check-in streaks',
        icon: '🔥'
      },
      {
        id: 'affiliates',
        name: 'Affiliate Experts',
        description: 'Users with most affiliate task completions',
        icon: '🎯'
      }
    ];
    
    res.json({ types });
  } catch (error) {
    console.error('Error fetching leaderboard types:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get leaderboard statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_premium = true AND premium_until > NOW() THEN 1 END) as premium_users,
        AVG(points) as avg_points,
        MAX(points) as highest_points,
        (SELECT COUNT(*) FROM user_statistics WHERE completed_tasks_count > 0) as active_users,
        (SELECT MAX(streak_count) FROM daily_checkins) as longest_checkin_streak
      FROM telegram_users 
      WHERE is_banned = false
    `);
    
    res.json({
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Error fetching leaderboard stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;