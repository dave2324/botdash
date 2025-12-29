const express = require('express');
const pool = require('../config/database');
const router = express.Router();

// GET /api/promotion-settings
// Returns the cost settings for different promotion types
router.get('/', async (req, res) => {
  try {
    const { type } = req.query;
    
    // If type is provided, get settings for that specific promotion type
    if (type && ['channel_join', 'video_boost'].includes(type)) {
      const settingsResult = await pool.query(`
        SELECT 
          calculate_promotion_cost_per_action($1) as cost_per_action,
          (SELECT value FROM settings WHERE key = $2) as reward_per_action,
          (SELECT value FROM settings WHERE key = $3) as admin_profit_per_action
      `, [
        type,
        type === 'channel_join' ? 'channel_join_reward_points' : 'video_boost_reward_points',
        type === 'channel_join' ? 'channel_join_admin_profit' : 'video_boost_admin_profit'
      ]);
      
      if (settingsResult.rows.length === 0) {
        return res.status(404).json({ message: 'Settings not found' });
      }
      
      const settings = settingsResult.rows[0];
      
      res.json({
        type,
        cost_per_action: parseInt(settings.cost_per_action) || 0,
        reward_per_action: parseInt(settings.reward_per_action) || 0,
        admin_profit_per_action: parseInt(settings.admin_profit_per_action) || 0
      });
    } 
    // Otherwise, return settings for all promotion types
    else {
      const channelSettingsResult = await pool.query(`
        SELECT 
          'channel_join' as type,
          calculate_promotion_cost_per_action('channel_join') as cost_per_action,
          (SELECT value FROM settings WHERE key = 'channel_join_reward_points') as reward_per_action,
          (SELECT value FROM settings WHERE key = 'channel_join_admin_profit') as admin_profit_per_action
      `);
      
      const videoSettingsResult = await pool.query(`
        SELECT 
          'video_boost' as type,
          calculate_promotion_cost_per_action('video_boost') as cost_per_action,
          (SELECT value FROM settings WHERE key = 'video_boost_reward_points') as reward_per_action,
          (SELECT value FROM settings WHERE key = 'video_boost_admin_profit') as admin_profit_per_action
      `);
      
      const settings = [
        ...channelSettingsResult.rows.map(row => ({
          type: row.type,
          cost_per_action: parseInt(row.cost_per_action),
          reward_per_action: parseInt(row.reward_per_action),
          admin_profit_per_action: parseInt(row.admin_profit_per_action)
        })),
        ...videoSettingsResult.rows.map(row => ({
          type: row.type,
          cost_per_action: parseInt(row.cost_per_action),
          reward_per_action: parseInt(row.reward_per_action),
          admin_profit_per_action: parseInt(row.admin_profit_per_action)
        }))
      ];
      
      res.json({ settings });
    }
  } catch (error) {
    console.error('Error fetching promotion settings:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
