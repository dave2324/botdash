const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const crypto = require('crypto');
const axios = require('axios');

// Import authentication middleware
const { validateTelegramWebAppData } = require('../../middleware/optimized-auth');

// Apply authentication middleware to all routes except webhook and approval
router.use((req, res, next) => {
  // Skip authentication for webhook endpoints and approval endpoints
  if ((req.path === '/webhook' || req.path === '/premium/webhook' || req.path.includes('/webhook') || req.path.includes('/transfer/approve')) && (req.method === 'POST' || req.method === 'GET')) {
    console.log('Skipping auth for webhook path:', req.path, 'method:', req.method);
    return next();
  }
  console.log('Applying auth for path:', req.path, 'method:', req.method);
  // Apply Telegram authentication for other endpoints
  return validateTelegramWebAppData(process.env.BOT_TOKEN)(req, res, next);
});

// GET /api/payments/deposits/settings
// Get deposit settings for frontend
router.get('/deposits/settings', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get deposit settings
    const settingsResult = await pool.query(
      `SELECT key, value FROM settings 
       WHERE key IN (
         'deposit_enabled', 
         'deposit_min_etb', 
         'deposit_max_etb',
         'deposit_points_per_etb',
         'conversion_rate_points_to_etb'
       )`
    );
    
    // Get user info
    const userResult = await pool.query(
      `SELECT points, is_premium FROM telegram_users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Format settings
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    res.json({
      deposit_enabled: settings.deposit_enabled === '1',
      min_amount: parseFloat(settings.deposit_min_etb || 50),
      max_amount: parseFloat(settings.deposit_max_etb || 10000),
      points_per_etb: parseFloat(settings.deposit_points_per_etb || 10),
      conversion_rate: parseFloat(settings.conversion_rate_points_to_etb || 0.1),
      user: {
        current_points: userResult.rows[0].points,
        is_premium: userResult.rows[0].is_premium
      }
    });
  } catch (error) {
    console.error('Error fetching deposit settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/payments/premium/settings
// Get premium pricing and settings for frontend
router.get('/premium/settings', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get premium settings
    const settingsResult = await pool.query(
      `SELECT key, value FROM settings 
       WHERE key IN ('premium_enabled', 'premium_price', 'premium_duration_days')`
    );
    
    // Get user's premium status
    const userResult = await pool.query(
      `SELECT is_premium, premium_until FROM telegram_users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Format settings into an object
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    // Return premium settings and user status
    res.json({
      premium_enabled: settings.premium_enabled === '1',
      premium_price: parseInt(settings.premium_price || 299),
      premium_duration_days: parseInt(settings.premium_duration_days || 30),
      user_is_premium: userResult.rows[0].is_premium || false,
      premium_until: userResult.rows[0].premium_until,
      currency: 'ETB'
    });
  } catch (error) {
    console.error('Error fetching premium settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/payments/deposits/initiate
// Initiate a deposit with Chapa
router.post('/deposits/initiate', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const userId = req.telegramUser?.id;
    const { amount_etb, email } = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate amount
    if (!amount_etb || amount_etb <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    // Validate email if provided
    let userEmail = email;
    if (!userEmail) {
      // Use default email if not provided
      userEmail = `user.${userId}@telegram.app`;
    } else {
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(userEmail)) {
        return res.status(400).json({ message: 'Invalid email format' });
      }
    }

    // Get settings
    const settingsResult = await client.query(
      `SELECT key, value FROM settings 
       WHERE key IN (
         'deposit_enabled',
         'deposit_min_etb', 
         'deposit_max_etb',
         'deposit_points_per_etb',
         'chapa_api_key',
         'chapa_test_mode'
       )`
    );
    
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    // Check if deposits are enabled
    if (settings.deposit_enabled !== '1') {
      return res.status(400).json({ message: 'Deposits are currently disabled' });
    }

    // Validate amount against limits
    const minAmount = parseFloat(settings.deposit_min_etb || 50);
    const maxAmount = parseFloat(settings.deposit_max_etb || 10000);
    
    if (amount_etb < minAmount) {
      return res.status(400).json({ message: `Minimum deposit amount is ${minAmount} ETB` });
    }
    
    if (amount_etb > maxAmount) {
      return res.status(400).json({ message: `Maximum deposit amount is ${maxAmount} ETB` });
    }

    // Calculate points to receive
    const pointsPerEtb = parseFloat(settings.deposit_points_per_etb || 10);
    const pointsToReceive = Math.floor(amount_etb * pointsPerEtb);

    // Generate unique transaction ID
    const transactionId = `DEP-${userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    // Begin transaction
    await client.query('BEGIN');

    // Create deposit record
    const depositResult = await client.query(
      `INSERT INTO deposits (
        user_id, 
        transaction_id, 
        amount_etb, 
        points_received, 
        conversion_rate,
        payment_method,
        status,
        user_email
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        userId,
        transactionId,
        amount_etb,
        pointsToReceive,
        pointsPerEtb,
        'chapa',
        'pending',
        userEmail
      ]
    );

    await client.query('COMMIT');

    // Integrate with Chapa API
    const chapaApiKey = settings.chapa_api_key || process.env.CHAPA_API_KEY;
    
    let paymentUrl = null;
    let paymentError = null;
    
    if (chapaApiKey && chapaApiKey !== '0') {
      try {
      const callbackUrl = `${process.env.BACKEND_URL || 'http://localhost:5001'}/api/payments/webhook`;
      const returnUrl = `https://t.me/${process.env.BOT_USERNAME || 'http://localhost:3000'}?startapp=deposit_${transactionId}`;
      console.log('Chapa callback_url:', callbackUrl);
      console.log('Chapa return_url:', returnUrl);

      // Create Chapa payment
      const chapaResponse = await axios.post(
        'https://api.chapa.co/v1/transaction/initialize',
        {
        amount: amount_etb,
        currency: 'ETB',
        email: userEmail, // Use the email from request or default
        first_name: 'User',
        last_name: userId.toString(),
        tx_ref: transactionId,
        callback_url: callbackUrl,
        return_url: returnUrl,
        customization: {
          title: 'Points Deposit',
          description: `Deposit ${amount_etb} ETB for ${pointsToReceive} points`
        },
        meta: {
          hide_receipt: true
        },
        'meta[hide_receipt]': true
        },
        {
        headers: {
          'Authorization': `Bearer ${chapaApiKey}`,
          'Content-Type': 'application/json'
        }
        }
      );
//      console.log(chapaResponse);

        if (chapaResponse.data.status === 'success') {
          paymentUrl = chapaResponse.data.data.checkout_url;
          
          // Update deposit record with Chapa checkout URL
          await pool.query(
            `UPDATE deposits 
             SET chapa_checkout_url = $1 
             WHERE transaction_id = $2`,
            [paymentUrl, transactionId]
          );
        } else {
          console.error('Chapa initialization failed:', chapaResponse.data);
          paymentError = chapaResponse.data.message || 'Failed to initialize payment with Chapa';
          
          // Mark deposit as failed
          await pool.query(
            `UPDATE deposits 
             SET status = 'failed',
                 failed_at = NOW(),
                 failure_reason = $1
             WHERE transaction_id = $2`,
            [paymentError, transactionId]
          );
        }
      } catch (chapaError) {
        console.error('Chapa API error:', chapaError.response?.data || chapaError.message);
        paymentError = chapaError.response?.data?.message || chapaError.message || 'Failed to connect to payment provider';
        
        // Mark deposit as failed
        await pool.query(
          `UPDATE deposits 
           SET status = 'failed',
               failed_at = NOW(),
               failure_reason = $1
           WHERE transaction_id = $2`,
          [paymentError, transactionId]
        );
      }
    } else {
      paymentError = 'Payment gateway is not configured. Please contact support.';
      
      // Mark deposit as failed
      await pool.query(
        `UPDATE deposits 
         SET status = 'failed',
             failed_at = NOW(),
             failure_reason = $1
         WHERE transaction_id = $2`,
        ['Payment gateway not configured', transactionId]
      );
    }

    // Return appropriate response based on payment initialization result
    if (paymentUrl) {
      res.json({
        success: true,
        transaction_id: transactionId,
        amount_etb: amount_etb,
        points_to_receive: pointsToReceive,
        payment_url: paymentUrl,
        deposit: depositResult.rows[0]
      });
    } else {
      // Payment initialization failed but deposit record was created
      res.status(400).json({
        success: false,
        message: paymentError || 'Failed to initialize payment',
        transaction_id: transactionId,
        deposit: depositResult.rows[0]
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error initiating deposit:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// POST /api/payments/premium/initiate
// Initiate a premium payment with Chapa
router.post('/premium/initiate', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    const { email } = req.body;
    
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Validate email
    if (!email || !email.includes('@')) {
      return res.status(400).json({ message: 'Valid email is required' });
    }

    // Get user info
    const userResult = await pool.query(
      `SELECT id, first_name, last_name, username, is_premium 
       FROM telegram_users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];
    
    // Check if user is already premium
    if (user.is_premium) {
      return res.status(400).json({ message: 'User is already premium' });
    }
    
    // Get settings
    const settingsResult = await pool.query(
      `SELECT key, value FROM settings 
       WHERE key IN ('premium_price', 'chapa_api_key', 'chapa_test_mode')`
    );
    
    // Format settings into an object
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });

    // Check if Chapa is configured
    if (!settings.chapa_api_key) {
      return res.status(500).json({ message: 'Payment gateway not configured' });
    }
    
    // Generate a unique transaction reference
    const txRef = `PREMIUM-${userId}-${Date.now()}`;
    
    // Create a payment record in the database
    const paymentResult = await pool.query(
      `INSERT INTO premium_payments 
         (user_id, amount, currency, payment_reference, provider, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, payment_reference`,
      [userId, settings.premium_price || 299, 'ETB', txRef, 'chapa', 'pending']
    );

    const payment = paymentResult.rows[0];
    
    // Call Chapa API to initialize transaction
    const chapaUrl = 'https://api.chapa.co/v1/transaction/initialize';
    const chapaData = {
      amount: settings.premium_price || 299,
      currency: 'ETB',
      email: email,
      first_name: user.first_name || 'Telegram',
      last_name: user.last_name || 'User',
      tx_ref: txRef,
      callback_url: `${process.env.BACKEND_URL || 'https://your-domain.com'}/api/payments/premium/verify`,
      return_url: `https://t.me/${process.env.BOT_USERNAME}?startapp=premium_${txRef}`,
      customization: {
        title: 'Premium Access',
        description: 'Upgrade to premium for exclusive benefits'
      },
      meta: {
        hide_receipt: true
      },
      'meta[hide_receipt]': true
    };
    
    const chapaResponse = await fetch(chapaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.chapa_api_key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(chapaData)
    });
    
    const chapaResponseData = await chapaResponse.json();

    if (chapaResponseData.status === 'success') {
      // Update payment record with checkout URL
      await pool.query(
        `UPDATE premium_payments 
         SET metadata = jsonb_set(metadata::jsonb, '{checkout_url}', $1::jsonb)
         WHERE id = $2`,
        [JSON.stringify(chapaResponseData.data.checkout_url), payment.id]
      );
      
      res.json({
        success: true,
        message: 'Payment initiated successfully',
        payment_reference: txRef,
        checkout_url: chapaResponseData.data.checkout_url
      });
    } else {
      // Update payment status to failed
      await pool.query(
        `UPDATE premium_payments SET status = 'failed' WHERE id = $1`,
        [payment.id]
      );
      
      res.status(400).json({
        success: false,
        message: 'Failed to initialize payment',
        error: chapaResponseData.message
      });
    }
  } catch (error) {
    console.error('Error initiating premium payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/payments/deposits/history
// Get user's deposit history
router.get('/deposits/history', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT 
        id,
        transaction_id,
        amount_etb,
        points_received,
        status,
        payment_method,
        created_at,
        completed_at,
        failed_at,
        failure_reason
       FROM deposits 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );

    res.json({
      deposits: result.rows
    });
  } catch (error) {
    console.error('Error fetching deposit history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/payments/premium/verify
// Verify a premium payment (used as callback from Chapa)
router.get('/verify', async (req, res) => {
  try {
    const { tx_ref, status, transaction_id } = req.query;
    
    if (!tx_ref) {
      return res.status(400).json({ message: 'Missing transaction reference' });
    }
    
    // Check if payment exists
    const paymentResult = await pool.query(
      `SELECT p.*, u.id as user_id, u.first_name
       FROM premium_payments p
       JOIN telegram_users u ON u.id = p.user_id
       WHERE p.payment_reference = $1`,
      [tx_ref]
    );
    
    if (paymentResult.rows.length === 0) {
      return res.status(404).json({ message: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    
    // If already processed, return current status
    if (payment.status === 'completed') {
      return res.json({
        success: true,
        message: 'Payment already verified',
        payment: {
          id: payment.id,
          reference: payment.payment_reference,
          status: payment.status
        }
      });
    }
    
    // Get Chapa API key
    const settingsResult = await pool.query(
      `SELECT value FROM settings WHERE key = 'chapa_api_key'`
    );
    const chapaApiKey = settingsResult.rows[0]?.value;
    
    if (!chapaApiKey) {
      return res.status(500).json({ message: 'Payment gateway not configured' });
    }
    
    // Verify with Chapa API
    try {
      const verifyResponse = await fetch(
        `https://api.chapa.co/v1/transaction/verify/${tx_ref}`,
        {
          headers: { 'Authorization': `Bearer ${chapaApiKey}` }
        }
      );
      
      const verifyResponseData = await verifyResponse.json();
      
      if (verifyResponseData.status === 'success') {
        const verifyData = verifyResponseData.data;
        
        // Update payment record
        await pool.query(
          `UPDATE premium_payments
           SET status = 'completed',
               provider_tx_id = $1,
               updated_at = NOW(),
               metadata = $2
           WHERE id = $3`,
          [transaction_id || verifyData.reference, JSON.stringify(verifyData), payment.id]
        );
        
        // Get premium duration setting
        const durationResult = await pool.query(
          `SELECT value FROM settings WHERE key = 'premium_duration_days'`
        );
        const premiumDays = parseInt(durationResult.rows[0]?.value || 30);
        
        // Calculate premium end date
        const premiumUntil = new Date();
        premiumUntil.setDate(premiumUntil.getDate() + premiumDays);
        
        // Update user to premium
        await pool.query(
          `UPDATE telegram_users
           SET is_premium = TRUE,
               premium_until = $1,
               premium_subscription_id = $2,
               premium_payment_reference = $3
           WHERE id = $4`,
          [premiumUntil, `PREMIUM-${Date.now()}`, tx_ref, payment.user_id]
        );
        
        // Award bonus points if configured
        const bonusResult = await pool.query(
          `SELECT value FROM settings WHERE key = 'premium_points_on_signup'`
        );
        
        if (bonusResult.rows.length > 0) {
          const bonusPoints = parseInt(bonusResult.rows[0].value || 0);
          if (bonusPoints > 0) {
            await pool.query(
              'SELECT add_points_to_user($1, $2)',
              [payment.user_id, bonusPoints]
            );
          }
        }
        
        // Send notification via bot if configured
        const { createBot } = require('../../bot');
        const bot = createBot();
        if (bot) {
          try {
            await bot.telegram.sendMessage(
              payment.user_id,
              `<b>🌟 Congratulations ${payment.first_name || 'User'}! 🌟</b>\n\nYou are now a <b>Premium Member</b>! Enjoy exclusive benefits and premium tasks until ${premiumUntil.toLocaleDateString()}.`,
              { parse_mode: 'HTML' }
            );
          } catch (err) {
            console.error('Error sending bot notification:', err);
          }
        }
        
        // Redirect to success page
        return res.redirect(`${process.env.MINI_APP_URL || 'https://your-domain.com'}/payment/success?ref=${tx_ref}`);
        
      } else {
        // Update payment status to failed
        await pool.query(
          `UPDATE premium_payments SET status = 'failed', updated_at = NOW() WHERE id = $1`,
          [payment.id]
        );
        
        return res.redirect(`${process.env.MINI_APP_URL || 'https://your-domain.com'}/payment/failed?ref=${tx_ref}`);
      }
      
    } catch (verifyError) {
      console.error('Error verifying payment with Chapa:', verifyError);
      return res.redirect(`${process.env.MINI_APP_URL || 'https://your-domain.com'}/payment/failed?ref=${tx_ref}&error=verification_failed`);
    }
    
  } catch (error) {
    console.error('Error verifying premium payment:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/payments/webhook and /api/payments/premium/webhook
// Unified webhook endpoint for all Chapa payment notifications
router.post('/webhook', handleChapaWebhook);
router.post('/premium/webhook', handleChapaWebhook);

// GET /api/payments/webhook and /api/payments/premium/webhook
// Handle Chapa GET callbacks (verification callbacks)
router.get('/webhook', handleChapaWebhook);
router.get('/premium/webhook', handleChapaWebhook);

// GET /api/payments/transfer/approve
// Chapa transfer approval URL endpoint (for automatic approval)
router.get('/transfer/approve', async (req, res) => {
  console.log('===== TRANSFER APPROVAL REQUEST =====');
  console.log('Method:', req.method);
  console.log('Headers:', req.headers);
  console.log('Query:', req.query);
  console.log('Body:', req.body);
  console.log('=====================================');
  
  try {
    const { transfer_id, reference, amount, account_number } = req.query;
    
    console.log('Transfer approval parameters:', {
      transfer_id,
      reference,
      amount,
      account_number
    });
    
    // Find the withdrawal by reference (transaction_id)
    if (reference) {
      const withdrawalResult = await pool.query(
        `SELECT * FROM withdrawals WHERE transaction_id = $1`,
        [reference]
      );
      
      if (withdrawalResult.rows.length > 0) {
        const withdrawal = withdrawalResult.rows[0];
        
        // Verify the amount matches
        if (Math.floor(withdrawal.amount_etb) === parseInt(amount)) {
          // Log the approval
          await pool.query(
            `UPDATE withdrawals 
             SET admin_notes = CONCAT(COALESCE(admin_notes, ''), ' | Transfer approved via URL at ', NOW()::text)
             WHERE transaction_id = $1`,
            [reference]
          );
          
          console.log(`Transfer approved for withdrawal: ${reference}`);
          
          // Return success response to approve the transfer
          return res.json({
            approved: true,
            message: 'Transfer approved successfully'
          });
        } else {
          console.error('Amount mismatch in transfer approval');
          return res.json({
            approved: false,
            message: 'Amount verification failed'
          });
        }
      }
    }
    
    // Default approve for testing
    console.log('Auto-approving transfer for testing');
    return res.json({
      approved: true,
      message: 'Transfer approved (test mode)'
    });
    
  } catch (error) {
    console.error('Error in transfer approval:', error);
    // Return approval anyway to not block transfers
    return res.json({
      approved: true,
      message: 'Transfer approved with error logged'
    });
  }
});

// POST /api/payments/transfer/approve
// Alternative POST endpoint for Chapa transfer approval
router.post('/transfer/approve', async (req, res) => {
  try {
    const { transfer_id, reference, amount, account_number } = req.body;
    
    console.log('Transfer approval POST request received:', {
      transfer_id,
      reference,
      amount,
      account_number
    });
    
    // Same logic as GET endpoint
    if (reference) {
      const withdrawalResult = await pool.query(
        `SELECT * FROM withdrawals WHERE transaction_id = $1`,
        [reference]
      );
      
      if (withdrawalResult.rows.length > 0) {
        const withdrawal = withdrawalResult.rows[0];
        
        if (Math.floor(withdrawal.amount_etb) === parseInt(amount)) {
          await pool.query(
            `UPDATE withdrawals 
             SET admin_notes = CONCAT(COALESCE(admin_notes, ''), ' | Transfer approved via POST at ', NOW()::text)
             WHERE transaction_id = $1`,
            [reference]
          );
          
          return res.json({
            approved: true,
            message: 'Transfer approved successfully'
          });
        }
      }
    }
    
    // Default approve for testing
    return res.json({
      approved: true,
      message: 'Transfer approved (test mode)'
    });
    
  } catch (error) {
    console.error('Error in transfer approval POST:', error);
    return res.json({
      approved: true,
      message: 'Transfer approved with error logged'
    });
  }
});

async function handleChapaWebhook(req, res) {
  try {
    // Get webhook secret for verification
    const settingsResult = await pool.query(
      `SELECT value FROM settings WHERE key IN ('chapa_webhook_secret', 'chapa_webhook_enabled')`
    );
    
    // Format settings into an object
    const settings = {};
    settingsResult.rows.forEach(row => {
      settings[row.key] = row.value;
    });
    
    // Verify webhook signature if secret is set
    if (settings.chapa_webhook_secret && settings.chapa_webhook_secret !== '0') {
      // Check for signature in multiple header formats
      const signature = req.headers['chapa-signature'] || 
                       req.headers['x-chapa-signature'] ||
                       req.headers['Chapa-Signature'];
  
      console.log('Webhook headers received:', {
        'chapa-signature': req.headers['chapa-signature'],
        'x-chapa-signature': req.headers['x-chapa-signature'],
        'Chapa-Signature': req.headers['Chapa-Signature']
      });
      
      if (!signature) {
        console.error('Missing Chapa webhook signature');
        return res.status(400).json({ error: 'Missing signature' });
      }
      
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', settings.chapa_webhook_secret)
        .update(payload)
        .digest('hex');
      
      console.log('Signature verification:', {
        received: signature,
        expected: expectedSignature,
        payload: payload
      });
      
      if (signature !== expectedSignature) {
        console.error('Invalid Chapa webhook signature');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Process the webhook payload
    const { event, tx_ref, reference, status, first_name } = req.body;

    console.log('Webhook received:', { event, tx_ref, reference, status, body: req.body });
    
    // Handle transfer events for withdrawals
    if (event === 'transfer.success' || event === 'transfer.failed') {
      return handleWithdrawalTransferWebhook(req.body, res);
    }

    // Handle both charge.completed and charge.success events
    if ((event === 'charge.completed' || event === 'charge.success') && (tx_ref || reference)) {
      const paymentRef = tx_ref || reference;

      // Determine payment type based on transaction reference prefix
      if (paymentRef.startsWith('DEP-')) {
        // Handle deposit payment
        return handleDepositWebhook(req.body, res);
      } else if (paymentRef.startsWith('PREMIUM-')) {
        // Handle premium payment
        return handlePremiumWebhook(req.body, res);
      }

      // Find the payment record
      const paymentResult = await pool.query(
        `SELECT id, user_id, status FROM premium_payments WHERE payment_reference = $1`,
        [paymentRef]
      );

      if (paymentResult.rows.length === 0) {
        console.error('Payment not found for webhook:', paymentRef);
        return res.status(404).json({ error: 'Payment not found' });
      }

      const payment = paymentResult.rows[0];

      // If already processed, return success
      if (payment.status === 'completed') {
        console.log('Payment already processed:', paymentRef);
        return res.status(200).json({ message: 'Payment already processed' });
      }

      // Update payment status
      await pool.query(
        `UPDATE premium_payments
         SET status = 'completed',
             provider_tx_id = $1,
             updated_at = NOW(),
             metadata = $2
         WHERE id = $3`,
        [reference || tx_ref, JSON.stringify(req.body), payment.id]
      );

      // Get premium duration setting
      const durationResult = await pool.query(
        `SELECT value FROM settings WHERE key = 'premium_duration_days'`
      );
      const premiumDays = parseInt(durationResult.rows[0]?.value || 30);
      
      // Calculate premium end date
      const premiumUntil = new Date();
      premiumUntil.setDate(premiumUntil.getDate() + premiumDays);
      
      // Update user to premium
      await pool.query(
        `UPDATE telegram_users
         SET is_premium = TRUE,
             premium_until = $1,
             premium_subscription_id = $2,
             premium_payment_reference = $3
         WHERE id = $4`,
        [premiumUntil, `PREMIUM-${Date.now()}`, paymentRef, payment.user_id]
      );
      
      // Send notification via bot if configured
      const { createBot } = require('../../bot');
      const bot = createBot();
      if (bot) {
        try {
          // Get user info
          const userResult = await pool.query(
            `SELECT first_name FROM telegram_users WHERE id = $1`,
            [payment.user_id]
          );
          
          if (userResult.rows.length > 0) {
            await bot.telegram.sendMessage(
              payment.user_id,
              `<b>🌟 Congratulations ${userResult.rows[0].first_name || 'User'}! 🌟</b>\n\nYou are now a <b>Premium Member</b>! Enjoy exclusive benefits and premium tasks until ${premiumUntil.toLocaleDateString()}.`,
              { parse_mode: 'HTML' }
            );
          }
        } catch (err) {
          console.error('Error sending bot notification:', err);
        }
      }
      
      console.log('Premium upgrade successful for user:', payment.user_id);
      
    } else if (event === 'charge.failed' || event === 'charge.cancelled' || event === 'charge.failed/cancelled') {
      const paymentRef = tx_ref || reference;
      
      if (paymentRef) {
        if (paymentRef.startsWith('DEP-')) {
          // Handle failed deposit
          await pool.query(
            `UPDATE deposits 
             SET status = 'failed',
                 failed_at = NOW(),
                 failure_reason = $1,
                 chapa_response = $2
             WHERE transaction_id = $3`,
            [req.body.failure_reason || 'Payment failed/cancelled', JSON.stringify(req.body), paymentRef]
          );
          
          console.log('Deposit failed/cancelled:', paymentRef);
        } else if (paymentRef.startsWith('PREMIUM-')) {
          // Handle failed premium payment
          await pool.query(
            `UPDATE premium_payments 
             SET status = 'failed', 
                 updated_at = NOW(),
                 metadata = $2
             WHERE payment_reference = $1`,
            [paymentRef, JSON.stringify(req.body)]
          );
          
          console.log('Premium payment failed/cancelled:', paymentRef);
        }
      }
    }
    
    res.status(200).json({ message: 'Webhook processed successfully' });
    
  } catch (error) {
    console.error('Error processing Chapa webhook:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// GET /api/payments/premium/status
// Check premium status for current user
router.get('/premium/status', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get user premium status
    const userResult = await pool.query(
      `SELECT is_premium, premium_until, premium_subscription_id, premium_payment_reference
       FROM telegram_users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = userResult.rows[0];
    
    // Check if premium has expired
    if (user.is_premium && user.premium_until && new Date(user.premium_until) < new Date()) {
      // Update user to non-premium
      await pool.query(
        `UPDATE telegram_users
         SET is_premium = FALSE
         WHERE id = $1`,
        [userId]
      );
      
      user.is_premium = false;
    }

    res.json({
      is_premium: user.is_premium || false,
      premium_until: user.premium_until,
      subscription_id: user.premium_subscription_id,
      payment_reference: user.premium_payment_reference
    });
  } catch (error) {
    console.error('Error checking premium status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to handle deposit webhooks
async function handleDepositWebhook(webhookData, res) {
  const client = await pool.connect();
  
  try {
    const { tx_ref, reference, status } = webhookData;
    const transaction_id = tx_ref;
    
    // Get deposit record
    const depositResult = await client.query(
      `SELECT * FROM deposits WHERE transaction_id = $1`,
      [transaction_id]
    );

    if (depositResult.rows.length === 0) {
      return res.status(404).json({ message: 'Deposit not found' });
    }

    const deposit = depositResult.rows[0];

    // Check if already processed
    if (deposit.status === 'completed') {
      return res.status(200).json({ message: 'Already processed' });
    }

    await client.query('BEGIN');

    // Update deposit status
    await client.query(
      `UPDATE deposits 
       SET status = 'completed', 
           completed_at = NOW(),
           chapa_reference = $1,
           chapa_response = $2
       WHERE transaction_id = $3`,
      [reference, JSON.stringify(webhookData), transaction_id]
    );

    // Add points to user
    const updateResult = await client.query(
      `UPDATE telegram_users 
       SET points = points + $1 
       WHERE id = $2
       RETURNING points`,
      [deposit.points_received, deposit.user_id]
    );

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
        deposit.user_id,
        'deposit',
        transaction_id,
        updateResult.rows[0].points - deposit.points_received,
        updateResult.rows[0].points,
        deposit.points_received,
        `Deposit of ${deposit.amount_etb} ETB via Chapa`
      ]
    );

    await client.query('COMMIT');
    
    console.log('Deposit completed for user:', deposit.user_id);
    return res.json({ success: true, message: 'Deposit processed' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing deposit webhook:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
}

// Helper function to handle withdrawal transfer webhooks
async function handleWithdrawalTransferWebhook(webhookData, res) {
  const client = await pool.connect();
  
  try {
    const { event, reference, transfer_id, status } = webhookData;
    
    // Find withdrawal by transaction_id (reference) or chapa_transfer_id
    const withdrawalResult = await client.query(
      `SELECT * FROM withdrawals 
       WHERE transaction_id = $1 OR chapa_transfer_id = $2`,
      [reference, transfer_id]
    );
    
    if (withdrawalResult.rows.length === 0) {
      console.error('Withdrawal not found for transfer webhook:', reference || transfer_id);
      return res.status(404).json({ message: 'Withdrawal not found' });
    }
    
    const withdrawal = withdrawalResult.rows[0];
    
    // Check if already processed
    if (withdrawal.status === 'completed' || withdrawal.status === 'failed') {
      return res.status(200).json({ message: 'Already processed' });
    }
    
    await client.query('BEGIN');
    
    if (event === 'transfer.success') {
      // Update withdrawal as completed
      await client.query(
        `UPDATE withdrawals 
         SET status = 'completed',
             completed_at = NOW(),
             admin_notes = 'Transfer completed automatically via Chapa',
             chapa_response = $1
         WHERE id = $2`,
        [JSON.stringify(webhookData), withdrawal.id]
      );
      
      // Log success transaction
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
          withdrawal.user_id,
          'withdrawal_completed',
          withdrawal.transaction_id,
          0,
          0,
          0,
          `Withdrawal of ${withdrawal.amount_etb} ETB completed successfully`
        ]
      );
      
      console.log(`Withdrawal ${withdrawal.transaction_id} completed successfully`);
      
    } else if (event === 'transfer.failed') {
      // Update withdrawal as failed
      await client.query(
        `UPDATE withdrawals 
         SET status = 'failed',
             failed_at = NOW(),
             failure_reason = $1,
             chapa_response = $2
         WHERE id = $3`,
        [webhookData.failure_reason || 'Transfer failed', JSON.stringify(webhookData), withdrawal.id]
      );
      
      // Refund points to user
      const refundResult = await client.query(
        `UPDATE telegram_users 
         SET points = points + $1 
         WHERE id = $2
         RETURNING points`,
        [withdrawal.points_deducted, withdrawal.user_id]
      );
      
      // Log refund transaction
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
          withdrawal.user_id,
          'refund',
          `REFUND-${withdrawal.transaction_id}`,
          refundResult.rows[0].points - withdrawal.points_deducted,
          refundResult.rows[0].points,
          withdrawal.points_deducted,
          `Refund for failed withdrawal ${withdrawal.transaction_id}`
        ]
      );
      
      console.log(`Withdrawal ${withdrawal.transaction_id} failed, ${withdrawal.points_deducted} points refunded`);
    }
    
    await client.query('COMMIT');
    return res.status(200).json({ success: true, message: 'Webhook processed' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing withdrawal transfer webhook:', error);
    return res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
}

// Helper function to handle premium webhooks
async function handlePremiumWebhook(webhookData, res) {
  try {
    const { tx_ref, reference } = webhookData;
    const paymentRef = tx_ref;
    
    // Find the payment record
    const paymentResult = await pool.query(
      `SELECT id, user_id, status FROM premium_payments WHERE payment_reference = $1`,
      [paymentRef]
    );
    
    if (paymentResult.rows.length === 0) {
      console.error('Payment not found for webhook:', paymentRef);
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    const payment = paymentResult.rows[0];
    
    // If already processed, return success
    if (payment.status === 'completed') {
      console.log('Payment already processed:', paymentRef);
      return res.status(200).json({ message: 'Payment already processed' });
    }
    
    // Update payment status
    await pool.query(
      `UPDATE premium_payments
       SET status = 'completed',
           provider_tx_id = $1,
           updated_at = NOW(),
           metadata = $2
       WHERE id = $3`,
      [reference || tx_ref, JSON.stringify(webhookData), payment.id]
    );
    
    // Get premium duration setting
    const durationResult = await pool.query(
      `SELECT value FROM settings WHERE key = 'premium_duration_days'`
    );
    const premiumDays = parseInt(durationResult.rows[0]?.value || 30);
    
    // Calculate premium end date
    const premiumUntil = new Date();
    premiumUntil.setDate(premiumUntil.getDate() + premiumDays);
    
    // Update user to premium
    await pool.query(
      `UPDATE telegram_users
       SET is_premium = TRUE,
           premium_until = $1,
           premium_subscription_id = $2,
           premium_payment_reference = $3
       WHERE id = $4`,
      [premiumUntil, `PREMIUM-${Date.now()}`, paymentRef, payment.user_id]
    );
    
    console.log('Premium upgrade successful for user:', payment.user_id);
    return res.json({ success: true, message: 'Premium payment processed' });
    
  } catch (error) {
    console.error('Error processing premium webhook:', error);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = router;
