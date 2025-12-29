const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get user's check-in status and streak
router.get('/status', auth, async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const today = new Date().toISOString().split('T')[0];
    
    // Get today's check-in
    const todayCheckinResult = await pool.query(
      'SELECT * FROM daily_checkins WHERE user_id = $1 AND check_in_date = $2',
      [userId, today]
    );
    
    // Get current streak
    const streakResult = await pool.query(`
      SELECT 
        streak_count,
        check_in_date,
        points_awarded,
        milestone_reached
      FROM daily_checkins 
      WHERE user_id = $1 
      ORDER BY check_in_date DESC 
      LIMIT 1
    `, [userId]);
    
    const currentStreak = streakResult.rows.length > 0 ? streakResult.rows[0] : null;
    const hasCheckedInToday = todayCheckinResult.rows.length > 0;
    
    // Calculate actual streak (check for consecutive days)
    let actualStreak = 0;
    if (currentStreak) {
      const lastCheckinDate = new Date(currentStreak.check_in_date);
      const todayDate = new Date(today);
      const diffTime = todayDate - lastCheckinDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays <= 1) {
        actualStreak = currentStreak.streak_count;
      }
    }
    
    // Get next milestone info
    const nextMilestoneResult = await pool.query(`
      SELECT * FROM checkin_settings 
      WHERE day_number > $1 AND is_milestone = true 
      ORDER BY day_number ASC 
      LIMIT 1
    `, [actualStreak]);
    
    // Get today's reward info
    const todayRewardResult = await pool.query(
      'SELECT * FROM checkin_settings WHERE day_number = $1',
      [hasCheckedInToday ? actualStreak : actualStreak + 1]
    );
    
    res.json({
      has_checked_in_today: hasCheckedInToday,
      current_streak: actualStreak,
      today_checkin: todayCheckinResult.rows[0] || null,
      next_milestone: nextMilestoneResult.rows[0] || null,
      today_reward: todayRewardResult.rows[0] || null
    });
  } catch (error) {
    console.error('Error fetching check-in status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Perform daily check-in
router.post('/checkin', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      await client.query('ROLLBACK');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const today = new Date().toISOString().split('T')[0];
    
    await client.query('BEGIN');
    
    // Check if already checked in today
    const existingCheckin = await client.query(
      'SELECT * FROM daily_checkins WHERE user_id = $1::BIGINT AND check_in_date = $2::DATE',
      [userId, today]
    );
    
    if (existingCheckin.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Already checked in today' });
    }
    
    // Get last check-in to calculate streak
    const lastCheckinResult = await client.query(`
      SELECT * FROM daily_checkins 
      WHERE user_id = $1::BIGINT 
      ORDER BY check_in_date DESC 
      LIMIT 1
    `, [userId]);
    
    let newStreak = 1;
    if (lastCheckinResult.rows.length > 0) {
      const lastCheckin = lastCheckinResult.rows[0];
      const lastDate = new Date(lastCheckin.check_in_date);
      const todayDate = new Date(today);
      const diffTime = todayDate - lastDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        // Consecutive day
        newStreak = lastCheckin.streak_count + 1;
      } else if (diffDays > 1) {
        // Streak broken, reset to 1
        newStreak = 1;
      }
    }
    
    // Get reward settings for this day
    const rewardSettings = await client.query(
      'SELECT * FROM checkin_settings WHERE day_number = $1',
      [newStreak]
    );
    
    let pointsAwarded = 10; // Default
    let milestoneReached = null;
    let milestoneBonus = 0;
    
    if (rewardSettings.rows.length > 0) {
      const setting = rewardSettings.rows[0];
      pointsAwarded = setting.points_reward;
      
      if (setting.is_milestone) {
        milestoneReached = newStreak;
        milestoneBonus = setting.milestone_bonus || 0;
        pointsAwarded += milestoneBonus;
      }
    }
    
    // Create check-in record
    const checkinResult = await client.query(`
      INSERT INTO daily_checkins (
        user_id, check_in_date, streak_count, points_awarded, milestone_reached
      ) VALUES ($1::BIGINT, $2::DATE, $3::INTEGER, $4::INTEGER, $5::INTEGER)
      RETURNING *
    `, [userId, today, newStreak, pointsAwarded, milestoneReached ? 1 : 0]);
    
    // Add points to user
    await client.query('SELECT add_points_to_user($1::BIGINT, $2::INTEGER)', [userId, pointsAwarded]);
    
    // Log transaction
    await client.query(`
      INSERT INTO enhanced_transaction_logs (
        user_id, transaction_type, amount, balance_before, balance_after,
        description, reference_type, reference_id
      )
      SELECT 
        $1::BIGINT, 'daily_checkin', $2::INTEGER,
        (SELECT points FROM telegram_users WHERE id = $1::BIGINT) - $2::INTEGER,
        (SELECT points FROM telegram_users WHERE id = $1::BIGINT),
        $3, 'daily_checkin', $4
    `, [
      userId, 
      pointsAwarded, 
      `Daily check-in reward - Day ${newStreak}${milestoneReached ? ' (Milestone!)' : ''}`,
      checkinResult.rows[0].id
    ]);
    
    await client.query('COMMIT');
    
    res.json({
      message: milestoneReached ? 'Milestone reached! Check-in successful!' : 'Check-in successful!',
      checkin: checkinResult.rows[0],
      points_awarded: pointsAwarded,
      milestone_bonus: milestoneBonus,
      new_streak: newStreak
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error performing check-in:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Get check-in history
router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    
    const result = await pool.query(`
      SELECT 
        dc.*,
        cs.is_milestone,
        cs.milestone_bonus
      FROM daily_checkins dc
      LEFT JOIN checkin_settings cs ON dc.streak_count = cs.day_number
      WHERE dc.user_id = $1
      ORDER BY dc.check_in_date DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM daily_checkins WHERE user_id = $1',
      [userId]
    );
    
    const total = parseInt(countResult.rows[0].count);
    
    // Get statistics
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_checkins,
        SUM(points_awarded) as total_points_earned,
        MAX(streak_count) as longest_streak,
        COUNT(CASE WHEN milestone_reached IS NOT NULL THEN 1 END) as milestones_reached
      FROM daily_checkins
      WHERE user_id = $1
    `, [userId]);
    
    res.json({
      history: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching check-in history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get check-in calendar (30-day view)
router.get('/calendar', auth, async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { year, month } = req.query;
    
    // Default to current month if not specified
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1;
    
    // Get first and last day of the month
    const startDate = new Date(targetYear, targetMonth - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(targetYear, targetMonth, 0).toISOString().split('T')[0];
    
    const result = await pool.query(`
      SELECT 
        dc.*,
        cs.is_milestone
      FROM daily_checkins dc
      LEFT JOIN checkin_settings cs ON dc.streak_count = cs.day_number
      WHERE dc.user_id = $1 
        AND dc.check_in_date >= $2 
        AND dc.check_in_date <= $3
      ORDER BY dc.check_in_date ASC
    `, [userId, startDate, endDate]);
    
    res.json({
      calendar: result.rows,
      year: targetYear,
      month: targetMonth
    });
  } catch (error) {
    console.error('Error fetching check-in calendar:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get check-in settings/rewards info
router.get('/rewards', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM checkin_settings 
      ORDER BY day_number ASC
    `);
    
    res.json({
      rewards: result.rows
    });
  } catch (error) {
    console.error('Error fetching check-in rewards:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;