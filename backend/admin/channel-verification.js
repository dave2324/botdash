const express = require('express');
const pool = require('../config/database');
const { adminAuth } = require('./auth');
const router = express.Router();

// Get channel verification settings
router.get('/channel-verification', adminAuth, async (req, res) => {
  try {
    // Get verification frequency setting
    const settingResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'channel_verification_frequency_hours'"
    );
    
    let frequency = 24; // Default to 24 hours
    
    if (settingResult.rows.length > 0) {
      frequency = parseInt(settingResult.rows[0].value);
    }
    
    // Get statistics on verifications
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as total_verifications,
        COUNT(*) FILTER (WHERE is_member = FALSE) as left_count,
        MAX(verification_time) as last_verification
      FROM channel_membership_verifications
    `);
    
    // Get users with left channels
    const userResult = await pool.query(`
      SELECT COUNT(*) as suspended_users
      FROM telegram_users
      WHERE has_left_channels = TRUE
    `);
    
    res.json({
      settings: {
        verification_frequency_hours: frequency
      },
      statistics: {
        total_verifications: parseInt(statsResult.rows[0].total_verifications) || 0,
        left_count: parseInt(statsResult.rows[0].left_count) || 0,
        suspended_users: parseInt(userResult.rows[0].suspended_users) || 0,
        last_verification: statsResult.rows[0].last_verification
      }
    });
  } catch (error) {
    console.error('Error getting channel verification settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update channel verification frequency
router.post('/channel-verification/frequency', adminAuth, async (req, res) => {
  try {
    const { frequency_hours } = req.body;
    
    // Validate input
    const hours = parseInt(frequency_hours);
    if (isNaN(hours) || hours < 1 || hours > 720) { // Max 30 days
      return res.status(400).json({ 
        message: 'Invalid frequency. Must be between 1 and 720 hours.' 
      });
    }
    
    // Update or insert the setting
    await pool.query(`
      INSERT INTO settings (key, value, description)
      VALUES ('channel_verification_frequency_hours', $1, 'How often to check if users have left channels (in hours)')
      ON CONFLICT (key) DO UPDATE
      SET value = $1, updated_at = NOW()
    `, [hours]);
    
    res.json({ 
      success: true, 
      message: `Verification frequency updated to ${hours} hours.`,
      settings: {
        verification_frequency_hours: hours
      }
    });
  } catch (error) {
    console.error('Error updating channel verification frequency:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Run a manual verification check
router.post('/channel-verification/run-check', adminAuth, async (req, res) => {
  try {
    const { createBot } = require('../bot');
    const bot = await createBot();
    
    if (!bot.isReady) {
      await bot.start();
    }
    
    // Run the verification
    const stats = await bot.verifyAllChannelMemberships();
    
    res.json({
      success: true,
      message: 'Channel verification check completed.',
      statistics: stats
    });
  } catch (error) {
    console.error('Error running verification check:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;