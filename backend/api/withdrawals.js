const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const crypto = require('crypto');
const axios = require('axios');
const { validateTelegramWebAppData } = require('../middleware/optimized-auth');

// Apply authentication middleware
router.use(validateTelegramWebAppData(process.env.BOT_TOKEN));

// GET /api/withdrawals/settings
// Get withdrawal settings and user eligibility
router.get('/settings', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get user's premium status first to determine minimum points
    const userStatusResult = await pool.query(
      `SELECT is_premium FROM telegram_users WHERE id = $1`,
      [userId]
    );
    
    if (userStatusResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    const isPremium = userStatusResult.rows[0].is_premium;
    
    // Get minimum points - check for premium-specific setting first, then fall back to regular setting
    let minPoints;
    if (isPremium) {
      // Try to get premium-specific minimum points
      const premiumMinResult = await pool.query(
        `SELECT value FROM settings WHERE key = 'premium_withdrawal_min_points'`,
      );
      
      // If premium setting exists and is not '0', use it; otherwise use regular setting
      if (premiumMinResult.rows[0]?.value && premiumMinResult.rows[0].value !== '0') {
        minPoints = parseInt(premiumMinResult.rows[0].value);
      } else {
        // Fall back to regular withdrawal_min_points for premium users
        const regularMinResult = await pool.query(
          `SELECT value FROM settings WHERE key = 'withdrawal_min_points'`,
        );
        minPoints = parseInt(regularMinResult.rows[0]?.value || 1000);
      }
    } else {
      // Regular users use withdrawal_min_points
      const regularMinResult = await pool.query(
        `SELECT value FROM settings WHERE key = 'withdrawal_min_points'`,
      );
      minPoints = parseInt(regularMinResult.rows[0]?.value || 1000);
    }
    
    // Check eligibility using stored function with minimum points
    const eligibilityResult = await pool.query(
      `SELECT * FROM check_withdrawal_eligibility($1, $2)`,
      [userId, minPoints]
    );

    const eligibility = eligibilityResult.rows[0];

    // Get settings
    const settingsResult = await pool.query(
      `SELECT key, value FROM settings 
       WHERE key IN (
         'withdrawal_enabled',
         'withdrawal_min_points',
         'withdrawal_max_points',
         'withdrawal_frequency',
         'withdrawal_daily_limit',
         'withdrawal_weekly_limit',
         'withdrawal_monthly_limit',
         'withdrawal_min_account_age_days',
         'withdrawal_min_tasks_completed',
         'conversion_rate_points_to_etb',
         'premium_withdrawal_bonus_percent',
         'premium_withdrawal_frequency',
         'premium_withdrawal_daily_limit',
         'premium_withdrawal_min_points'
       )`
    );
    
    // Get user info
    const userResult = await pool.query(
      `SELECT 
        u.points, 
        u.is_premium,
        u.created_at,
        COUNT(DISTINCT tp.id) as tasks_completed
       FROM telegram_users u
       LEFT JOIN task_progress tp ON tp.user_id = u.id AND tp.status = 'completed'
       WHERE u.id = $1
       GROUP BY u.id`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];
    
    // Format settings
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    // Calculate account age
    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    
    const dailyLimit = isPremium && settings.premium_withdrawal_daily_limit
      ? parseFloat(settings.premium_withdrawal_daily_limit)
      : parseFloat(settings.withdrawal_daily_limit || 5000);

    res.json({
      withdrawal_enabled: settings.withdrawal_enabled === '1',
      min_points: minPoints,
      max_points: parseInt(settings.withdrawal_max_points || 50000),
      conversion_rate: parseFloat(settings.conversion_rate_points_to_etb || 0.1),
      frequency: isPremium && settings.premium_withdrawal_frequency === 'unlimited' 
        ? 'unlimited' 
        : settings.withdrawal_frequency,
      limits: {
        daily: dailyLimit,
        weekly: parseFloat(settings.withdrawal_weekly_limit || 20000),
        monthly: parseFloat(settings.withdrawal_monthly_limit || 50000),
        daily_remaining: parseFloat(eligibility.daily_limit_remaining || dailyLimit || 0),
        weekly_remaining: parseFloat(eligibility.weekly_limit_remaining || settings.withdrawal_weekly_limit || 20000),
        monthly_remaining: parseFloat(eligibility.monthly_limit_remaining || settings.withdrawal_monthly_limit || 50000)
      },
      requirements: {
        min_account_age_days: parseInt(settings.withdrawal_min_account_age_days || 7),
        min_tasks_completed: parseInt(settings.withdrawal_min_tasks_completed || 10),
        current_account_age_days: accountAgeDays,
        current_tasks_completed: parseInt(user.tasks_completed)
      },
      premium_benefits: {
        bonus_percent: isPremium ? parseInt(settings.premium_withdrawal_bonus_percent || 0) : 0,
        has_unlimited_frequency: isPremium && settings.premium_withdrawal_frequency === 'unlimited',
        lower_minimum: isPremium && settings.premium_withdrawal_min_points
      },
      user: {
        current_points: user.points,
        is_premium: isPremium,
        is_eligible: eligibility.is_eligible,
        eligibility_reason: eligibility.reason
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawal settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/withdrawals/banks
// Get available banks from Chapa API
router.get('/banks', async (req, res) => {
  try {
    // Get Chapa API key from settings
    const settingsResult = await pool.query(
      `SELECT value FROM settings WHERE key = 'chapa_api_key'`
    );
    
    const chapaApiKey = settingsResult.rows[0]?.value;
    
    if (!chapaApiKey || chapaApiKey === '0') {
      // Return default banks if Chapa API is not configured
      return res.json({
        banks: [
          { id: 'telebirr', name: 'Telebirr', is_mobilemoney: true, slug: 'telebirr' },
          { id: 'cbebirr', name: 'CBE Birr', is_mobilemoney: true, slug: 'cbebirr' },
          { id: 'cbe', name: 'Commercial Bank of Ethiopia', is_mobilemoney: false, slug: 'cbe' },
          { id: 'abyssinia', name: 'Bank of Abyssinia', is_mobilemoney: false, slug: 'abyssinia' },
          { id: 'awash', name: 'Awash Bank', is_mobilemoney: false, slug: 'awash' },
          { id: 'dashen', name: 'Dashen Bank', is_mobilemoney: false, slug: 'dashen' }
        ],
        source: 'default'
      });
    }
    
    try {
      // Fetch banks from Chapa API
      const response = await axios.get('https://api.chapa.co/v1/banks', {
        headers: {
          'Authorization': `Bearer ${chapaApiKey}`
        }
      });
      
      if (response.data && response.data.data) {
        // Filter for active Ethiopian banks
        const ethiopianBanks = response.data.data.filter(bank => 
          bank.is_active && bank.currency === 'ETB'
        );
        
        // Format the response
        const formattedBanks = ethiopianBanks.map(bank => ({
          id: bank.id.toString(),
          slug: bank.slug,
          name: bank.name,
          swift: bank.swift,
          is_mobilemoney: bank.is_mobilemoney === 1 || bank.is_mobilemoney === true,
          acct_length: bank.acct_length,
          is_rtgs: bank.is_rtgs === 1,
          is_24hrs: bank.is_24hrs === 1
        }));
        
        // Sort banks: mobile money first, then alphabetically
        formattedBanks.sort((a, b) => {
          if (a.is_mobilemoney && !b.is_mobilemoney) return -1;
          if (!a.is_mobilemoney && b.is_mobilemoney) return 1;
          return a.name.localeCompare(b.name);
        });
        
        res.json({
          banks: formattedBanks,
          source: 'chapa'
        });
      } else {
        throw new Error('Invalid response from Chapa');
      }
    } catch (chapaError) {
      console.error('Error fetching banks from Chapa:', chapaError.message);
      // Return default banks as fallback
      res.json({
        banks: [
          { id: 'telebirr', name: 'Telebirr', is_mobilemoney: true, slug: 'telebirr' },
          { id: 'cbebirr', name: 'CBE Birr', is_mobilemoney: true, slug: 'cbebirr' },
          { id: 'cbe', name: 'Commercial Bank of Ethiopia', is_mobilemoney: false, slug: 'commercial_bank_of_ethiopia' },
          { id: 'abyssinia', name: 'Bank of Abyssinia', is_mobilemoney: false, slug: 'bank_of_abyssinia' },
          { id: 'awash', name: 'Awash Bank', is_mobilemoney: false, slug: 'awash_bank' },
          { id: 'dashen', name: 'Dashen Bank', is_mobilemoney: false, slug: 'dashen_bank' },
          { id: 'abay', name: 'Abay Bank', is_mobilemoney: false, slug: 'abay_bank' },
          { id: 'enat', name: 'Enat Bank', is_mobilemoney: false, slug: 'enat_bank' },
          { id: 'wegagen', name: 'Wegagen Bank', is_mobilemoney: false, slug: 'wegagen_bank' }
        ],
        source: 'fallback',
        error: 'Using cached bank list'
      });
    }
  } catch (error) {
    console.error('Error in banks endpoint:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/withdrawals/accounts
// Get user's withdrawal accounts
router.get('/accounts', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT 
        id,
        account_type,
        account_number,
        account_name,
        is_verified,
        is_default,
        created_at
       FROM user_withdrawal_accounts 
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY is_default DESC, created_at DESC`,
      [userId]
    );

    res.json({
      accounts: result.rows
    });
  } catch (error) {
    console.error('Error fetching withdrawal accounts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/withdrawals/accounts/validate
// Validate a bank account with Chapa before adding
router.post('/accounts/validate', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    const { account_number, account_type, bank_code } = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate input
    if (!account_number) {
      return res.status(400).json({ message: 'Account number is required' });
    }

    // Get Chapa API key
    const settingsResult = await pool.query(
      `SELECT key, value FROM settings 
       WHERE key IN ('chapa_api_key', 'chapa_test_mode')`
    );
    
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    if (!settings.chapa_api_key || settings.chapa_api_key === '0') {
      // If no Chapa API key, skip validation but warn user
      return res.json({
        success: true,
        validated: false,
        message: 'Account validation unavailable. Please verify account details manually.',
        account_name: null
      });
    }

    // Map account type to Chapa bank codes
    const bankCodeMapping = {
      'telebirr': '853',     // Telebirr (Ethio Telecom)
      'cbebirr': '941',      // CBE Birr
      'cbe': '01',           // Commercial Bank of Ethiopia
      'awash': '02',         // Awash Bank
      'dashen': '03',        // Dashen Bank
      'abyssinia': '04',     // Bank of Abyssinia
      'enat': '05',          // Enat Bank
      'wegagen': '06',       // Wegagen Bank
      'abay': '07',          // Abay Bank
      'berhan': '08',        // Berhan Bank
      'oromia': '09',        // Oromia Bank
      'amhara': '10',        // Amhara Bank
      'bank': '01'           // Default to CBE
    };
    
    const chapaBank = bank_code || bankCodeMapping[account_type?.toLowerCase()] || '01';
    
    // Note: Chapa bank validation API may not be available for all account types
    // For mobile wallets (Telebirr, CBE Birr), validation might not be supported
    
    // Skip validation for mobile wallets as they typically don't support validation
    if (['telebirr', 'cbebirr'].includes(account_type?.toLowerCase())) {
      console.log('Mobile wallet detected - skipping validation as not supported by provider');
      return res.json({
        success: true,
        validated: false,
        message: 'Mobile wallet accounts cannot be validated automatically. Please ensure the phone number is correct.',
        skip_validation: true
      });
    }
    
    try {
      // Try to validate bank accounts (may not work for all banks)
      // Note: This endpoint might not be available in Chapa's current API
      const validationResponse = await axios.get(
        `https://api.chapa.co/v1/bank-account-verification`,
        {
          params: {
            account_number: account_number,
            bank_code: chapaBank
          },
          headers: {
            'Authorization': `Bearer ${settings.chapa_api_key}`
          }
        }
      );
      
      if (validationResponse.data.status === 'success') {
        const accountData = validationResponse.data.data;
        return res.json({
          success: true,
          validated: true,
          account_name: accountData.account_name || accountData.account_holder_name,
          bank_name: accountData.bank_name,
          message: 'Account validated successfully'
        });
      } else {
        return res.json({
          success: false,
          validated: false,
          message: validationResponse.data.message || 'Account validation failed',
          error: 'Invalid account details'
        });
      }
    } catch (validationError) {
      console.error('Chapa account validation error:', validationError.response?.data || validationError.message);
      
      // Account validation is not critical - users can still add accounts without validation
      // Most Ethiopian banks and wallets don't provide real-time validation anyway
      
      if (settings.chapa_test_mode === '1' || settings.chapa_test_mode === 'true') {
        return res.json({
          success: true,
          validated: false,
          message: 'Test mode - validation skipped. Please verify account details manually.',
          test_mode: true
        });
      }
      
      // Return success but mark as not validated
      // This allows users to add accounts even if validation is not available
      return res.json({
        success: true,
        validated: false,
        message: 'Account validation is currently unavailable. Please double-check your account details before proceeding.',
        validation_unavailable: true
      });
    }
  } catch (error) {
    console.error('Error validating account:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/withdrawals/accounts
// Add a new withdrawal account
router.post('/accounts', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    const { account_type, account_number, account_name, set_as_default, is_validated } = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate input
    if (!account_number || !account_type) {
      return res.status(400).json({ message: 'Account number and type are required' });
    }

    // Account type validation is now more flexible
    // It can be either a numeric bank ID from Chapa or a slug for backward compatibility
    if (!account_type) {
      return res.status(400).json({ message: 'Account type is required' });
    }
    
    // Log for debugging
    console.log('Adding account with type:', account_type, 'number:', account_number);

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // If setting as default, unset other defaults (only for active accounts)
      if (set_as_default) {
        await client.query(
          `UPDATE user_withdrawal_accounts 
           SET is_default = FALSE 
           WHERE user_id = $1 AND is_active = TRUE`,
          [userId]
        );
      }

      // Insert new account with validation status
      const result = await client.query(
        `INSERT INTO user_withdrawal_accounts (
          user_id,
          account_type,
          account_number,
          account_name,
          is_default,
          is_verified
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, account_type, account_number) 
        DO UPDATE SET 
          account_name = EXCLUDED.account_name,
          is_default = EXCLUDED.is_default,
          is_verified = EXCLUDED.is_verified,
          updated_at = NOW()
        RETURNING *`,
        [userId, account_type, account_number, account_name || null, set_as_default || false, is_validated || false]
      );

      await client.query('COMMIT');
      
      res.json({
        success: true,
        account: result.rows[0]
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adding withdrawal account:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /api/withdrawals/accounts/:id
// Remove a withdrawal account
router.delete('/accounts/:id', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    const accountId = parseInt(req.params.id);
    
    console.log('Delete account request:', { userId, accountId, params: req.params });
    
    if (!userId) {
      console.error('Delete account: No user ID found');
      return res.status(401).json({ message: 'Unauthorized' });
    }
    
    if (isNaN(accountId)) {
      console.error('Delete account: Invalid account ID:', req.params.id);
      return res.status(400).json({ message: 'Invalid account ID' });
    }

    // First check if the account exists
    const checkResult = await pool.query(
      `SELECT id FROM user_withdrawal_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, userId]
    );
    
    if (checkResult.rows.length === 0) {
      console.log('Delete account: Account not found for user', { accountId, userId });
      return res.status(404).json({ message: 'Account not found or you do not have permission to delete it' });
    }

    // Check if this account has been used in any withdrawals
    const withdrawalCheckResult = await pool.query(
      `SELECT COUNT(*) as count FROM withdrawals WHERE withdrawal_account_id = $1`,
      [accountId]
    );
    
    const hasWithdrawals = parseInt(withdrawalCheckResult.rows[0].count) > 0;
    
    if (hasWithdrawals) {
      // Soft delete the account (mark as inactive)
      console.log('Delete account: Account has withdrawal history, using soft delete', { accountId });
      
      const result = await pool.query(
        `UPDATE user_withdrawal_accounts 
         SET is_active = FALSE, deleted_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [accountId, userId]
      );
      
      console.log('Soft delete result:', result.rows);
      
      res.json({
        success: true,
        message: 'Account removed successfully',
        deleted_id: accountId,
        soft_deleted: true
      });
      return;
    }

    // Hard delete the account if no withdrawals exist
    const result = await pool.query(
      `DELETE FROM user_withdrawal_accounts 
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [accountId, userId]
    );

    console.log('Delete account result:', result.rows);

    res.json({
      success: true,
      message: 'Account removed successfully',
      deleted_id: accountId
    });
  } catch (error) {
    console.error('Error removing withdrawal account:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper function to check Chapa balance
async function checkChapaBalance(apiKey) {
  try {
    const response = await axios.get('https://api.chapa.co/v1/balances', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (response.data && response.data.status === 'success' && response.data.data) {
      // Find ETB balance from the array
      const etbBalance = response.data.data.find(balance => balance.currency === 'ETB');
      
      if (etbBalance) {
        return {
          success: true,
          balance: parseFloat(etbBalance.available_balance || 0),
          ledger_balance: parseFloat(etbBalance.ledger_balance || 0),
          currency: 'ETB',
          all_balances: response.data.data
        };
      } else {
        return {
          success: true,
          balance: 0,
          ledger_balance: 0,
          currency: 'ETB',
          all_balances: response.data.data,
          message: 'ETB balance not found'
        };
      }
    }
    
    return { success: false, balance: 0, error: 'Invalid response format' };
  } catch (error) {
    console.error('Error checking Chapa balance:', error.response?.data || error.message);
    return { success: false, balance: 0, error: error.message };
  }
}

// Helper function to initiate Chapa transfer
async function initiateChapaTransfer(withdrawal, accountName) {
  try {
    // Get Chapa API configuration
    const settingsResult = await pool.query(
      `SELECT key, value FROM settings 
       WHERE key IN ('chapa_api_key', 'chapa_test_mode')`
    );
    
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    if (!settings.chapa_api_key || settings.chapa_api_key === '0') {
      throw new Error('Chapa API key not configured');
    }
    
    // Check if in test mode
    const isTestMode = settings.chapa_test_mode === '1' || settings.chapa_test_mode === 'true';
    
    // Check Chapa balance before initiating transfer
    const balanceCheck = await checkChapaBalance(settings.chapa_api_key);
    
    if (balanceCheck.success) {
      // Check if balance is sufficient
      if (balanceCheck.balance < withdrawal.amount_etb) {
        console.log(`Insufficient Chapa balance. Required: ${withdrawal.amount_etb} ETB, Available: ${balanceCheck.balance} ETB`);
        return {
          success: false,
          insufficientBalance: true,
          availableBalance: balanceCheck.balance,
          requiredAmount: withdrawal.amount_etb,
          error: `Insufficient balance. Available: ${balanceCheck.balance} ETB, Required: ${withdrawal.amount_etb} ETB`
        };
      }
      
      console.log(`Chapa balance sufficient. Available: ${balanceCheck.balance} ETB, Required: ${withdrawal.amount_etb} ETB`);
    } else {
      console.warn('Could not verify Chapa balance, proceeding with transfer attempt');
    }
    
    // For Chapa transfers, we need to use the bank ID from their API
    // The account_type should store the bank ID from Chapa's bank list
    let bankCode = withdrawal.account_type;
    
    // If it's an old format (slug), try to get the actual bank ID
    // This handles backward compatibility
    if (isNaN(bankCode)) {
      console.log('Account type is not a bank ID, attempting to fetch from Chapa...');
      
      try {
        // Try to get the bank list and find the matching bank
        const banksResponse = await axios.get('https://api.chapa.co/v1/banks', {
          headers: {
            'Authorization': `Bearer ${settings.chapa_api_key}`
          }
        });
        
        if (banksResponse.data && banksResponse.data.data) {
          const bank = banksResponse.data.data.find(b => 
            b.slug === withdrawal.account_type || 
            b.slug.includes(withdrawal.account_type) ||
            b.name.toLowerCase().includes(withdrawal.account_type.toLowerCase())
          );
          
          if (bank) {
            bankCode = bank.id.toString();
            console.log(`Found bank ID ${bankCode} for ${withdrawal.account_type}`);
          } else {
            console.log(`Bank not found for ${withdrawal.account_type}, using as-is`);
          }
        }
      } catch (err) {
        console.error('Failed to fetch banks for mapping:', err.message);
      }
    }
    
    // IMPORTANT: Use actual user account number, NOT test numbers
    let actualAccountNumber = withdrawal.account_number;
    
    // Only override for test mode if explicitly needed for testing
    if (isTestMode && process.env.FORCE_TEST_ACCOUNT === 'true') {
      console.log('Test mode with forced test account enabled');
      actualAccountNumber = '1000000000000'; // Only for explicit testing
    }
    
    // Build the approval URL
    const backendUrl = process.env.BACKEND_URL || 'https://minigamebackend.anyspace.live';
    const approvalUrl = `${backendUrl}/api/payments/transfer/approve`;
    
    // Initiate transfer via Chapa API
    const transferPayload = {
      account_name: accountName || 'Customer Account',
      account_number: actualAccountNumber, // Use the actual account number variable
      amount: Math.floor(withdrawal.amount_etb), // Chapa requires integer amount
      currency: 'ETB',
      bank_code: bankCode,
      reference: withdrawal.transaction_id,
      reason: 'Game Platform Withdrawal',
      approval_url: approvalUrl // Include approval URL for both test and production
    };
    
    console.log('Initiating Chapa transfer:', {
      ...transferPayload,
      bank_type: withdrawal.account_type,
      bank_code: bankCode,
      account_number: transferPayload.account_number.slice(0, 4) + '****' // Mask account for logs
    });
    
    const transferResponse = await axios.post(
      'https://api.chapa.co/v1/transfers',
      transferPayload,
      {
        headers: {
          'Authorization': `Bearer ${settings.chapa_api_key}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('Chapa transfer response:', {
      status: transferResponse.data.status,
      message: transferResponse.data.message,
      data: transferResponse.data.data
    });
    
    if (transferResponse.data.status === 'success') {
      // In test mode, simulate completion after a delay
      if (isTestMode) {
        console.log('Test mode: Scheduling automatic completion for withdrawal');
        setTimeout(async () => {
          try {
            console.log(`Test mode: Auto-completing withdrawal ${withdrawal.transaction_id}`);
            await pool.query(
              `UPDATE withdrawals 
               SET status = 'completed',
                   completed_at = NOW(),
                   admin_notes = 'Auto-completed in test mode'
               WHERE transaction_id = $1 AND status = 'processing'`,
              [withdrawal.transaction_id]
            );
            console.log(`Test mode: Withdrawal ${withdrawal.transaction_id} marked as completed`);
          } catch (err) {
            console.error('Test mode: Error auto-completing withdrawal:', err);
          }
        }, 5000); // Complete after 5 seconds in test mode
      }
      
      return {
        success: true,
        transferId: transferResponse.data.data?.id || transferResponse.data.data?.transfer_id || transferResponse.data.data,
        data: transferResponse.data.data,
        testMode: isTestMode
      };
    } else {
      return {
        success: false,
        error: transferResponse.data.message || 'Transfer failed'
      };
    }
  } catch (error) {
    console.error('Chapa transfer error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message
    };
  }
}

// POST /api/withdrawals/request
// Request a withdrawal with automatic Chapa transfer
router.post('/request', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = req.telegramUser?.id;
    const { points_amount, account_id, account_number, account_type } = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate input
    if (!points_amount || points_amount <= 0) {
      return res.status(400).json({ message: 'Invalid points amount' });
    }

    // Check eligibility
    const eligibilityResult = await client.query(
      `SELECT * FROM check_withdrawal_eligibility($1, $2)`,
      [userId, points_amount]
    );

    const eligibility = eligibilityResult.rows[0];
    
    if (!eligibility.is_eligible) {
      return res.status(400).json({ 
        message: eligibility.reason,
        eligibility: eligibility
      });
    }

    // Get conversion rate and premium bonus
    const settingsResult = await client.query(
      `SELECT key, value FROM settings 
       WHERE key IN ('conversion_rate_points_to_etb', 'premium_withdrawal_bonus_percent')`
    );
    
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    // Get user premium status
    const userResult = await client.query(
      `SELECT is_premium FROM telegram_users WHERE id = $1`,
      [userId]
    );
    
    const isPremium = userResult.rows[0]?.is_premium || false;
    const conversionRate = parseFloat(settings.conversion_rate_points_to_etb || 0.1);
    const bonusPercent = isPremium ? parseFloat(settings.premium_withdrawal_bonus_percent || 0) : 0;
    
    // Calculate ETB amount with premium bonus
    let amountEtb = points_amount * conversionRate;
    if (bonusPercent > 0) {
      amountEtb = amountEtb * (1 + bonusPercent / 100);
    }

    // Get account details if account_id provided
    let withdrawalAccountId = account_id;
    let withdrawalAccountNumber = account_number;
    let withdrawalAccountType = account_type || 'cbe';
    
    if (account_id) {
      const accountResult = await client.query(
        `SELECT * FROM user_withdrawal_accounts 
         WHERE id = $1 AND user_id = $2`,
        [account_id, userId]
      );
      
      if (accountResult.rows.length > 0) {
        const account = accountResult.rows[0];
        withdrawalAccountNumber = account.account_number;
        withdrawalAccountType = account.account_type;
      }
    }

    if (!withdrawalAccountNumber) {
      return res.status(400).json({ message: 'Withdrawal account is required' });
    }

    // Generate shorter transaction ID (max 36 chars for Chapa)
    const shortUserId = userId.toString().slice(-6); // Last 6 digits of user ID
    const timestamp = Date.now().toString().slice(-10); // Last 10 digits of timestamp
    const transactionId = `WTH-${shortUserId}-${timestamp}`;

    await client.query('BEGIN');

    // Create withdrawal record with processing status
    const withdrawalResult = await client.query(
      `INSERT INTO withdrawals (
        user_id,
        transaction_id,
        points_deducted,
        amount_etb,
        conversion_rate,
        withdrawal_account_id,
        account_number,
        account_type,
        status,
        admin_notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        userId,
        transactionId,
        points_amount,
        amountEtb,
        conversionRate,
        withdrawalAccountId,
        withdrawalAccountNumber,
        withdrawalAccountType,
        'processing',
        'Initiating automated transfer via Chapa'
      ]
    );

    // Deduct points from user
    const updateResult = await client.query(
      `UPDATE telegram_users 
       SET points = points - $1 
       WHERE id = $2 AND points >= $1
       RETURNING points`,
      [points_amount, userId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error('Insufficient points');
    }

    // Log transaction
    await client.query(
      `INSERT INTO transaction_logs (
        user_id,
        transaction_type,
        transaction_id,
        points_before,
        points_after,
        points_change,
        description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        userId,
        'withdrawal',
        transactionId,
        updateResult.rows[0].points + points_amount,
        updateResult.rows[0].points,
        -points_amount,
        `Withdrawal request of ${amountEtb.toFixed(2)} ETB`
      ]
    );

    await client.query('COMMIT');
    
    // Get account name if available
    let accountName = null;
    if (withdrawalAccountId) {
      const accountResult = await pool.query(
        `SELECT account_name FROM user_withdrawal_accounts WHERE id = $1`,
        [withdrawalAccountId]
      );
      accountName = accountResult.rows[0]?.account_name;
    }
    
    // Attempt to initiate Chapa transfer
    const transferResult = await initiateChapaTransfer(
      withdrawalResult.rows[0],
      accountName
    );
    
    if (transferResult.success) {
      // Update withdrawal with Chapa transfer ID
      await pool.query(
        `UPDATE withdrawals 
         SET chapa_transfer_id = $1,
             processed_at = NOW(),
             admin_notes = 'Automated transfer initiated successfully'
         WHERE transaction_id = $2`,
        [transferResult.transferId, transactionId]
      );
      
      const message = transferResult.testMode 
        ? 'Withdrawal initiated in test mode. Will be auto-completed in 5 seconds.'
        : 'Withdrawal is being processed automatically';
      
      res.json({
        success: true,
        withdrawal: {
          ...withdrawalResult.rows[0],
          chapa_transfer_id: transferResult.transferId
        },
        new_balance: updateResult.rows[0].points,
        message: message,
        transfer_status: 'initiated',
        test_mode: transferResult.testMode || false
      });
    } else if (transferResult.insufficientBalance) {
      // Insufficient balance - set to pending for later processing
      await pool.query(
        `UPDATE withdrawals 
         SET status = 'pending',
             admin_notes = $1,
             metadata = jsonb_build_object(
               'insufficient_balance', true,
               'available_balance', $2,
               'required_amount', $3,
               'last_check', NOW()
             )
         WHERE transaction_id = $4`,
        [
          `Insufficient Chapa balance. Available: ${transferResult.availableBalance} ETB, Required: ${transferResult.requiredAmount} ETB. Will retry when balance is available.`,
          transferResult.availableBalance,
          transferResult.requiredAmount,
          transactionId
        ]
      );
      
      res.json({
        success: true,
        withdrawal: withdrawalResult.rows[0],
        new_balance: updateResult.rows[0].points,
        message: 'Withdrawal request submitted. Your withdrawal is pending due to payment provider balance. It will be processed automatically when funds are available.',
        transfer_status: 'pending_balance',
        insufficient_balance: true,
        available_balance: transferResult.availableBalance
      });
    } else {
      // Other transfer failures
      await pool.query(
        `UPDATE withdrawals 
         SET status = 'pending',
             admin_notes = $1
         WHERE transaction_id = $2`,
        [`Auto-transfer failed: ${transferResult.error}. Requires manual processing.`, transactionId]
      );
      
      res.json({
        success: true,
        withdrawal: withdrawalResult.rows[0],
        new_balance: updateResult.rows[0].points,
        message: 'Withdrawal request submitted. Processing may take some time.',
        transfer_status: 'pending',
        transfer_error: transferResult.error
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing withdrawal request:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  } finally {
    client.release();
  }
});

// GET /api/withdrawals/history
// Get user's withdrawal history
router.get('/history', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT 
        w.id,
        w.transaction_id,
        w.points_deducted,
        w.amount_etb,
        w.status,
        w.account_number,
        w.account_type,
        w.created_at,
        w.processed_at,
        w.completed_at,
        w.failed_at,
        w.failure_reason,
        w.admin_notes
       FROM withdrawals w
       WHERE w.user_id = $1 
       ORDER BY w.created_at DESC 
       LIMIT 50`,
      [userId]
    );

    // Get summary statistics
    const statsResult = await pool.query(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
        COUNT(*) FILTER (WHERE status = 'failed' OR status = 'rejected') as failed_count,
        SUM(amount_etb) FILTER (WHERE status = 'completed') as total_withdrawn_etb,
        SUM(points_deducted) FILTER (WHERE status = 'completed') as total_points_withdrawn
       FROM withdrawals 
       WHERE user_id = $1`,
      [userId]
    );

    res.json({
      withdrawals: result.rows,
      statistics: statsResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching withdrawal history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/withdrawals/limits
// Get current withdrawal limits and remaining amounts
router.get('/limits', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Check eligibility with 0 points to get limit information
    const eligibilityResult = await pool.query(
      `SELECT * FROM check_withdrawal_eligibility($1, 0)`,
      [userId]
    );

    const eligibility = eligibilityResult.rows[0];

    res.json({
      is_eligible: eligibility.is_eligible,
      reason: eligibility.reason,
      limits: {
        daily_remaining: parseFloat(eligibility.daily_limit_remaining || 0),
        weekly_remaining: parseFloat(eligibility.weekly_limit_remaining || 0),
        monthly_remaining: parseFloat(eligibility.monthly_limit_remaining || 0)
      }
    });
  } catch (error) {
    console.error('Error fetching withdrawal limits:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Function to process pending withdrawals with insufficient balance
async function processPendingWithdrawals() {
  try {
    console.log('Checking pending withdrawals for balance processing...');
    
    // Get Chapa API key
    const settingsResult = await pool.query(
      `SELECT value FROM settings WHERE key = 'chapa_api_key'`
    );
    
    const chapaApiKey = settingsResult.rows[0]?.value;
    if (!chapaApiKey || chapaApiKey === '0') {
      console.log('Chapa API key not configured, skipping pending withdrawal processing');
      return;
    }
    
    // Check current balance
    const balanceCheck = await checkChapaBalance(chapaApiKey);
    if (!balanceCheck.success) {
      console.log('Could not check Chapa balance, will retry later');
      return;
    }
    
    console.log(`Current Chapa balance: ${balanceCheck.balance} ETB`);
    
    // Get pending withdrawals that failed due to insufficient balance
    const pendingWithdrawals = await pool.query(`
      SELECT * FROM withdrawals 
      WHERE status = 'pending' 
        AND (metadata->>'insufficient_balance')::boolean = true
        AND amount_etb <= $1
      ORDER BY created_at ASC
      LIMIT 10
    `, [balanceCheck.balance]);
    
    if (pendingWithdrawals.rows.length === 0) {
      console.log('No pending withdrawals can be processed with current balance');
      return;
    }
    
    console.log(`Found ${pendingWithdrawals.rows.length} pending withdrawals to process`);
    
    // Process each withdrawal
    for (const withdrawal of pendingWithdrawals.rows) {
      try {
        console.log(`Processing withdrawal ${withdrawal.transaction_id} for ${withdrawal.amount_etb} ETB`);
        
        // Get account name if available
        let accountName = null;
        if (withdrawal.withdrawal_account_id) {
          const accountResult = await pool.query(
            `SELECT account_name FROM user_withdrawal_accounts WHERE id = $1`,
            [withdrawal.withdrawal_account_id]
          );
          accountName = accountResult.rows[0]?.account_name;
        }
        
        // Attempt transfer
        const transferResult = await initiateChapaTransfer(withdrawal, accountName);
        
        if (transferResult.success) {
          // Update withdrawal as processing
          await pool.query(
            `UPDATE withdrawals 
             SET status = 'processing',
                 chapa_transfer_id = $1,
                 processed_at = NOW(),
                 admin_notes = 'Processed automatically after balance became available'
             WHERE id = $2`,
            [transferResult.transferId, withdrawal.id]
          );
          
          console.log(`Successfully initiated transfer for withdrawal ${withdrawal.transaction_id}`);
        } else if (transferResult.insufficientBalance) {
          // Still insufficient balance, update metadata
          await pool.query(
            `UPDATE withdrawals 
             SET metadata = jsonb_set(metadata, '{last_check}', to_jsonb(NOW()::text))
             WHERE id = $1`,
            [withdrawal.id]
          );
          
          console.log(`Still insufficient balance for withdrawal ${withdrawal.transaction_id}`);
          break; // Stop processing if balance is still insufficient
        } else {
          // Other error, mark as failed
          await pool.query(
            `UPDATE withdrawals 
             SET status = 'failed',
                 failed_at = NOW(),
                 failure_reason = $1,
                 admin_notes = 'Failed during automatic processing'
             WHERE id = $2`,
            [transferResult.error, withdrawal.id]
          );
          
          console.log(`Failed to process withdrawal ${withdrawal.transaction_id}: ${transferResult.error}`);
        }
        
        // Small delay between processing to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing withdrawal ${withdrawal.transaction_id}:`, error);
        continue;
      }
    }
    
  } catch (error) {
    console.error('Error in processPendingWithdrawals:', error);
  }
}

// Start periodic scheduler if this is the main process
if (require.main === module || process.env.NODE_ENV !== 'test') {
  // Run every 10 minutes
  const SCHEDULER_INTERVAL = 10 * 60 * 1000; // 10 minutes
  
  setInterval(processPendingWithdrawals, SCHEDULER_INTERVAL);
  console.log('Withdrawal processing scheduler started (runs every 10 minutes)');
  
  // Run once on startup after 30 seconds
  setTimeout(processPendingWithdrawals, 30000);
}

// Export the function so it can be called manually if needed
router.processPendingWithdrawals = processPendingWithdrawals;

module.exports = router;