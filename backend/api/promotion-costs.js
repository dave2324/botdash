const express = require('express');
const pool = require('../config/database');

const router = express.Router();

/**
 * GET /api/promotion-costs
 * Fetches the cost structure for promotions and calculates budget or target based on input
 */
router.get('/', async (req, res) => {
  try {
    // Get user from auth middleware
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Extract query parameters
    const { type, target, budget } = req.query;
    const promotionType = type === 'channel_join' ? 'channel_join' : 'video_boost';
    
    // Validate - require either target or budget, not both
    const hasTarget = target !== undefined && !isNaN(parseInt(target));
    const hasBudget = budget !== undefined && !isNaN(parseInt(budget));
    
    if ((hasTarget && hasBudget) || (!hasTarget && !hasBudget)) {
      return res.status(400).json({ 
        message: 'Provide either target or budget parameter, not both or neither' 
      });
    }

    // Fetch cost settings from database
    const costResult = await pool.query(`
      SELECT 
        (SELECT value FROM settings WHERE key = $1) as reward_per_action,
        (SELECT value FROM settings WHERE key = $2) as admin_profit
    `, [
      promotionType === 'channel_join' ? 'channel_join_reward_points' : 'video_boost_reward_points',
      promotionType === 'channel_join' ? 'channel_join_admin_profit' : 'video_boost_admin_profit'
    ]);

    // If settings not found, return default values
    if (costResult.rows.length === 0) {
      return res.status(500).json({ message: 'Cost settings not configured' });
    }

    const rewardPerAction = parseInt(costResult.rows[0].reward_per_action);
    const adminProfit = parseInt(costResult.rows[0].admin_profit);
    const costPerAction = rewardPerAction + adminProfit;

    // Calculate based on provided parameter
    let calculatedTarget, calculatedBudget;
    
    if (hasTarget) {
      const targetValue = parseInt(target);
      calculatedBudget = targetValue * costPerAction;
      calculatedTarget = targetValue;
    } else {
      const budgetValue = parseInt(budget);
      calculatedTarget = Math.floor(budgetValue / costPerAction);
      calculatedBudget = calculatedTarget * costPerAction;
    }

    res.json({
      promotion_type: promotionType,
      cost_per_action: costPerAction,
      reward_per_action: rewardPerAction,
      admin_profit_per_action: adminProfit,
      target: calculatedTarget,
      budget: calculatedBudget
    });
  } catch (error) {
    console.error('Error fetching promotion costs:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
