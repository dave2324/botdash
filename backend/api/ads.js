const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// Get active ads for display
router.get('/', async (req, res) => {
  try {
    const { placement = 'dashboard', limit = 5 } = req.query;
    
    const result = await pool.query(`
      SELECT 
        id, ad_type, title, description, image_url, video_url, destination_url, target_placement
      FROM local_ads
      WHERE status = 'approved' 
        AND is_active = true
        AND (start_date IS NULL OR start_date <= NOW())
        AND (end_date IS NULL OR end_date >= NOW())
        AND (target_placement IS NULL OR target_placement = $1 OR target_placement = 'all')
        AND (budget_limit IS NULL OR total_spent < budget_limit)
      ORDER BY RANDOM()
      LIMIT $2
    `, [placement, limit]);
    
    res.json({
      ads: result.rows
    });
  } catch (error) {
    console.error('Error fetching ads:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Record ad impression
router.post('/:id/impression', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, placement, user_agent } = req.body;
    const ip_address = req.ip || req.connection.remoteAddress;
    
    // Check if ad exists and is active
    const adResult = await pool.query(`
      SELECT * FROM local_ads 
      WHERE id = $1 AND status = 'approved' AND is_active = true
    `, [id]);
    
    if (adResult.rows.length === 0) {
      return res.status(404).json({ message: 'Ad not found or inactive' });
    }
    
    // Record impression
    await pool.query(`
      INSERT INTO ad_impressions (ad_id, user_id, ip_address, user_agent, placement)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, user_id || null, ip_address, user_agent, placement]);
    
    // Update ad impressions count
    await pool.query(`
      UPDATE local_ads SET impressions = impressions + 1 WHERE id = $1
    `, [id]);
    
    res.json({ message: 'Impression recorded' });
  } catch (error) {
    console.error('Error recording impression:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Record ad click
router.post('/:id/click', async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, placement, user_agent } = req.body;
    const ip_address = req.ip || req.connection.remoteAddress;
    
    // Check if ad exists and is active
    const adResult = await pool.query(`
      SELECT * FROM local_ads 
      WHERE id = $1 AND status = 'approved' AND is_active = true
    `, [id]);
    
    if (adResult.rows.length === 0) {
      return res.status(404).json({ message: 'Ad not found or inactive' });
    }
    
    const ad = adResult.rows[0];
    
    // Record click
    await pool.query(`
      INSERT INTO ad_clicks (ad_id, user_id, ip_address, user_agent, placement)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, user_id || null, ip_address, user_agent, placement]);
    
    // Update ad clicks count and calculate cost
    let costPerClick = 0;
    if (ad.payment_type === 'CPC') {
      costPerClick = ad.payment_amount;
    }
    
    await pool.query(`
      UPDATE local_ads SET 
        clicks = clicks + 1,
        total_spent = total_spent + $2
      WHERE id = $1
    `, [id, costPerClick]);
    
    res.json({ 
      message: 'Click recorded',
      destination_url: ad.destination_url
    });
  } catch (error) {
    console.error('Error recording click:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit new ad (public endpoint for advertisers)
router.post('/submit', async (req, res) => {
  try {
    const {
      advertiser_name, advertiser_email, advertiser_phone, ad_type, title,
      description, image_url, video_url, destination_url, display_duration_days,
      target_placement, payment_type, payment_amount, budget_limit
    } = req.body;
    
    if (!advertiser_name || !advertiser_email || !ad_type || !title || !payment_type || !payment_amount) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    const result = await pool.query(`
      INSERT INTO local_ads (
        advertiser_name, advertiser_email, advertiser_phone, ad_type, title,
        description, image_url, video_url, destination_url, display_duration_days,
        target_placement, payment_type, payment_amount, budget_limit, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
      RETURNING id, status
    `, [
      advertiser_name, advertiser_email, advertiser_phone, ad_type, title,
      description, image_url, video_url, destination_url, display_duration_days || 7,
      target_placement, payment_type, payment_amount, budget_limit
    ]);
    
    res.status(201).json({
      message: 'Ad submitted successfully. It will be reviewed by admin.',
      ad_id: result.rows[0].id,
      status: result.rows[0].status
    });
  } catch (error) {
    console.error('Error submitting ad:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get ad placements
router.get('/placements', async (req, res) => {
  try {
    const placements = [
      { id: 'dashboard', name: 'Dashboard/Homepage', description: 'Main homepage banner' },
      { id: 'tasks', name: 'Tasks Page', description: 'Between task listings' },
      { id: 'earn', name: 'Earn Page', description: 'On affiliate tasks page' },
      { id: 'courses', name: 'Courses Page', description: 'Between course listings' },
      { id: 'leaderboard', name: 'Leaderboard', description: 'On leaderboard page' },
      { id: 'all', name: 'All Pages', description: 'Display on all supported pages' }
    ];
    
    res.json({ placements });
  } catch (error) {
    console.error('Error fetching placements:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;