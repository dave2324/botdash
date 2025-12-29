const express = require('express');
const pool = require('../config/database');

const router = express.Router();

// Function to mask user info for privacy
function maskUserInfo(user) {
  if (!user || !user.first_name) return 'Anonymous';
  
  const firstName = user.first_name;
  if (firstName.length <= 2) {
    return firstName[0] + '*'.repeat(firstName.length - 1);
  }
  
  const visibleLength = Math.ceil(firstName.length * 0.4); // Show 40% of name
  const maskedLength = firstName.length - visibleLength;
  
  return firstName.substring(0, visibleLength) + '*'.repeat(maskedLength);
}

// Get recent withdrawal feed
router.get('/', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Get recent withdrawals
    const result = await pool.query(`
      SELECT 
        w.id,
        w.amount,
        w.currency,
        w.status,
        w.created_at,
        tu.first_name,
        tu.last_name,
        tu.username,
        tu.is_premium,
        tu.premium_until
      FROM withdrawals w
      JOIN telegram_users tu ON w.user_id = tu.id
      WHERE w.status IN ('completed', 'approved', 'processing')
      ORDER BY w.created_at DESC
      LIMIT $1
    `, [limit]);
    
    // Transform data to mask user info
    const withdrawalFeed = result.rows.map(withdrawal => {
      const maskedName = maskUserInfo(withdrawal);
      const isPremium = withdrawal.is_premium && 
                       withdrawal.premium_until && 
                       new Date(withdrawal.premium_until) > new Date();
      
      return {
        id: withdrawal.id,
        masked_name: maskedName,
        amount: withdrawal.amount,
        currency: withdrawal.currency || 'ETB',
        status: withdrawal.status,
        created_at: withdrawal.created_at,
        is_premium: isPremium,
        // Add some motivational messages
        message: generateMotivationalMessage(withdrawal.amount, maskedName, isPremium)
      };
    });
    
    res.json({
      withdrawals: withdrawalFeed,
      total_shown: withdrawalFeed.length
    });
  } catch (error) {
    console.error('Error fetching withdrawal feed:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get withdrawal statistics for motivation
router.get('/stats', async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_withdrawals,
        SUM(amount) as total_amount_withdrawn,
        AVG(amount) as avg_withdrawal_amount,
        MAX(amount) as highest_withdrawal,
        COUNT(DISTINCT user_id) as unique_withdrawers,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 END) as withdrawals_today,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as withdrawals_this_week
      FROM withdrawals
      WHERE status IN ('completed', 'approved', 'processing')
    `);
    
    const premiumStats = await pool.query(`
      SELECT 
        COUNT(CASE WHEN tu.is_premium = true AND tu.premium_until > NOW() THEN 1 END) as premium_withdrawals,
        COALESCE(AVG(CASE WHEN tu.is_premium = true AND tu.premium_until > NOW() THEN w.amount END), 0) as avg_premium_withdrawal
      FROM withdrawals w
      JOIN telegram_users tu ON w.user_id = tu.id
      WHERE w.status IN ('completed', 'approved', 'processing')
    `);
    
    res.json({
      stats: {
        ...stats.rows[0],
        ...premiumStats.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawal stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Function to generate motivational messages
function generateMotivationalMessage(amount, maskedName, isPremium) {
  const messages = [
    `🎉 ${maskedName} just withdrew ${amount} ETB! You can do it too!`,
    `💰 ${maskedName} cashed out ${amount} ETB! Keep earning!`,
    `🚀 ${maskedName} successfully withdrew ${amount} ETB! Your turn next!`,
    `✨ ${maskedName} earned and withdrew ${amount} ETB! Start earning now!`,
    `🔥 ${maskedName} just got paid ${amount} ETB! Join the earning spree!`,
    `💎 ${maskedName} collected ${amount} ETB! Every task counts!`,
    `🎯 ${maskedName} hit their goal with ${amount} ETB withdrawal!`,
    `⭐ ${maskedName} turned effort into ${amount} ETB! Your turn!`
  ];
  
  const premiumMessages = [
    `👑 Premium member ${maskedName} withdrew ${amount} ETB! Premium pays off!`,
    `🏆 ${maskedName} (Premium) cashed out ${amount} ETB! Upgrade for more!`,
    `💫 Premium user ${maskedName} earned ${amount} ETB! Go Premium today!`,
    `🎖️ ${maskedName} (Premium) just withdrew ${amount} ETB! Premium advantages!`
  ];
  
  const messageArray = isPremium ? premiumMessages : messages;
  const randomMessage = messageArray[Math.floor(Math.random() * messageArray.length)];
  
  return randomMessage;
}

module.exports = router;