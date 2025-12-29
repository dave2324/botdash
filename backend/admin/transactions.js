const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { adminAuth } = require('./auth');
const axios = require('axios');

// GET /admin/transactions
// Get all transactions with filtering and pagination
router.get('/', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const offset = (page - 1) * limit;
    
    const { type, status, dateRange, search } = req.query;
    
    // Build dynamic WHERE conditions
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;
    
    // Type filter
    if (type && type !== 'all') {
      if (type === 'deposit') {
        whereConditions.push('type = $' + paramIndex++);
        queryParams.push('deposit');
      } else if (type === 'withdrawal') {
        whereConditions.push('type = $' + paramIndex++);
        queryParams.push('withdrawal');
      } else if (type === 'premium') {
        whereConditions.push('type = $' + paramIndex++);
        queryParams.push('premium');
      }
    }
    
    // Status filter
    if (status && status !== 'all') {
      whereConditions.push('status = $' + paramIndex++);
      queryParams.push(status);
    }
    
    // Date range filter
    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      let dateStart;
      
      switch(dateRange) {
        case 'today':
          dateStart = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          dateStart = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          dateStart = new Date(now.setMonth(now.getMonth() - 1));
          break;
      }
      
      if (dateStart) {
        whereConditions.push('created_at >= $' + paramIndex++);
        queryParams.push(dateStart.toISOString());
      }
    }
    
    // Search filter (user_id or transaction_id)
    if (search) {
      whereConditions.push('(user_id::text LIKE $' + paramIndex + ' OR transaction_id LIKE $' + (paramIndex + 1) + ')');
      queryParams.push('%' + search + '%');
      queryParams.push('%' + search + '%');
      paramIndex += 2;
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // Combine all transaction types using UNION ALL
    const query = `
      WITH combined_transactions AS (
        -- Deposits
        SELECT 
          'deposit' as type,
          d.id,
          d.user_id,
          u.username as user_username,
          u.first_name as user_name,
          d.transaction_id,
          d.amount_etb,
          d.points_received as points,
          d.status,
          d.payment_method,
          NULL as account_number,
          NULL as account_type,
          d.created_at,
          d.completed_at,
          d.failed_at,
          d.failure_reason,
          d.chapa_reference,
          NULL as admin_notes
        FROM deposits d
        LEFT JOIN telegram_users u ON u.id = d.user_id
        
        UNION ALL
        
        -- Withdrawals
        SELECT 
          'withdrawal' as type,
          w.id,
          w.user_id,
          u.username as user_username,
          u.first_name as user_name,
          w.transaction_id,
          w.amount_etb,
          w.points_deducted as points,
          w.status,
          NULL as payment_method,
          w.account_number,
          w.account_type,
          w.created_at,
          w.completed_at,
          w.failed_at,
          w.failure_reason,
          NULL as chapa_reference,
          w.admin_notes
        FROM withdrawals w
        LEFT JOIN telegram_users u ON u.id = w.user_id
        
        UNION ALL
        
        -- Premium Payments
        SELECT 
          'premium' as type,
          p.id,
          p.user_id,
          u.username as user_username,
          u.first_name as user_name,
          p.payment_reference as transaction_id,
          p.amount,
          NULL as points,
          p.status,
          p.provider as payment_method,
          NULL as account_number,
          NULL as account_type,
          p.created_at,
          p.updated_at as completed_at,
          NULL as failed_at,
          NULL as failure_reason,
          p.provider_tx_id as chapa_reference,
          NULL as admin_notes
        FROM premium_payments p
        LEFT JOIN telegram_users u ON u.id = p.user_id
      )
      SELECT * FROM combined_transactions
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    
    // Get transactions
    const transactionsResult = await pool.query(query, queryParams);
    
    // Get total count for pagination
    const countQuery = `
      WITH combined_transactions AS (
        SELECT 'deposit' as type, id, user_id, transaction_id, status, created_at FROM deposits
        UNION ALL
        SELECT 'withdrawal' as type, id, user_id, transaction_id, status, created_at FROM withdrawals
        UNION ALL
        SELECT 'premium' as type, id, user_id, payment_reference as transaction_id, status, created_at FROM premium_payments
      )
      SELECT COUNT(*) FROM combined_transactions ${whereClause}
    `;
    
    const countResult = await pool.query(
      countQuery, 
      queryParams.slice(0, -2) // Remove limit and offset params
    );
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limit);
    
    // Get statistics
    const statsResult = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM deposits) as total_deposits,
        (SELECT COUNT(*) FROM withdrawals) as total_withdrawals,
        (SELECT COUNT(*) FROM premium_payments) as total_premium_payments,
        (SELECT COALESCE(SUM(amount_etb), 0) FROM deposits WHERE status = 'completed') as total_deposit_amount,
        (SELECT COALESCE(SUM(amount_etb), 0) FROM withdrawals WHERE status = 'completed') as total_withdrawal_amount,
        (SELECT COALESCE(SUM(amount), 0) FROM premium_payments WHERE status = 'completed') as total_premium_amount,
        (SELECT COUNT(*) FROM deposits WHERE status = 'pending') as pending_deposits,
        (SELECT COUNT(*) FROM withdrawals WHERE status = 'pending') as pending_withdrawals
    `);
    
    res.json({
      transactions: transactionsResult.rows,
      statistics: statsResult.rows[0],
      totalCount,
      totalPages,
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PATCH /admin/transactions/:id/status
// Update transaction status
router.patch('/:id/status', adminAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { id } = req.params;
    const { status, type } = req.body;
    
    await client.query('BEGIN');
    
    if (type === 'deposit') {
      // Update deposit status
      const depositResult = await client.query(
        `UPDATE deposits 
         SET status = $1,
             ${status === 'completed' ? 'completed_at = NOW()' : ''}
             ${status === 'failed' || status === 'rejected' ? 'failed_at = NOW(), failure_reason = \'Rejected by admin\'' : ''}
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );
      
      if (depositResult.rows.length === 0) {
        throw new Error('Deposit not found');
      }
      
      const deposit = depositResult.rows[0];
      
      // If approving, add points to user
      if (status === 'completed' && deposit.points_received > 0) {
        await client.query(
          `UPDATE telegram_users 
           SET points = points + $1 
           WHERE id = $2`,
          [deposit.points_received, deposit.user_id]
        );
        
        // Log transaction
        await client.query(
          `INSERT INTO transaction_logs (
            user_id, 
            transaction_type, 
            transaction_id,
            points_change, 
            description
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            deposit.user_id,
            'deposit_approved',
            deposit.transaction_id,
            deposit.points_received,
            `Deposit of ${deposit.amount_etb} ETB approved by admin`
          ]
        );
      }
      
    } else if (type === 'withdrawal') {
      // Update withdrawal status
      const withdrawalResult = await client.query(
        `UPDATE withdrawals 
         SET status = $1,
             ${status === 'completed' ? 'completed_at = NOW(), admin_notes = \'Approved by admin\'' : ''}
             ${status === 'rejected' ? 'failed_at = NOW(), failure_reason = \'Rejected by admin\'' : ''}
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );
      
      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal not found');
      }
      
      const withdrawal = withdrawalResult.rows[0];
      
      // If rejecting, refund points to user
      if (status === 'rejected' && withdrawal.points_deducted > 0) {
        await client.query(
          `UPDATE telegram_users 
           SET points = points + $1 
           WHERE id = $2`,
          [withdrawal.points_deducted, withdrawal.user_id]
        );
        
        // Log refund
        await client.query(
          `INSERT INTO transaction_logs (
            user_id,
            transaction_type,
            transaction_id,
            points_change,
            description
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            withdrawal.user_id,
            'refund',
            `REFUND-${withdrawal.transaction_id}`,
            withdrawal.points_deducted,
            `Refund for rejected withdrawal ${withdrawal.transaction_id}`
          ]
        );
      }
      
    } else if (type === 'premium') {
      // Update premium payment status
      const paymentResult = await client.query(
        `UPDATE premium_payments 
         SET status = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );
      
      if (paymentResult.rows.length === 0) {
        throw new Error('Premium payment not found');
      }
      
      const payment = paymentResult.rows[0];
      
      // If approving, activate premium
      if (status === 'completed') {
        // Get premium duration setting
        const durationResult = await client.query(
          `SELECT value FROM settings WHERE key = 'premium_duration_days'`
        );
        const premiumDays = parseInt(durationResult.rows[0]?.value || 30);
        
        // Calculate premium end date
        const premiumUntil = new Date();
        premiumUntil.setDate(premiumUntil.getDate() + premiumDays);
        
        // Update user to premium
        await client.query(
          `UPDATE telegram_users
           SET is_premium = TRUE,
               premium_until = $1,
               premium_subscription_id = $2,
               premium_payment_reference = $3
           WHERE id = $4`,
          [premiumUntil, `PREMIUM-${Date.now()}`, payment.payment_reference, payment.user_id]
        );
      }
    }
    
    await client.query('COMMIT');
    res.json({ success: true, message: 'Status updated successfully' });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating transaction status:', error);
    res.status(500).json({ message: error.message || 'Server error' });
  } finally {
    client.release();
  }
});

// GET /admin/transactions/export
// Export transactions as CSV
router.get('/export', adminAuth, async (req, res) => {
  try {
    const { type, status, dateRange, search } = req.query;
    
    // Build dynamic WHERE conditions (similar to main query)
    let whereConditions = [];
    let queryParams = [];
    let paramIndex = 1;
    
    // Apply same filters as main query
    if (type && type !== 'all') {
      if (type === 'deposit') {
        whereConditions.push('type = $' + paramIndex++);
        queryParams.push('deposit');
      } else if (type === 'withdrawal') {
        whereConditions.push('type = $' + paramIndex++);
        queryParams.push('withdrawal');
      } else if (type === 'premium') {
        whereConditions.push('type = $' + paramIndex++);
        queryParams.push('premium');
      }
    }
    
    if (status && status !== 'all') {
      whereConditions.push('status = $' + paramIndex++);
      queryParams.push(status);
    }
    
    if (dateRange && dateRange !== 'all') {
      const now = new Date();
      let dateStart;
      
      switch(dateRange) {
        case 'today':
          dateStart = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          dateStart = new Date(now.setDate(now.getDate() - 7));
          break;
        case 'month':
          dateStart = new Date(now.setMonth(now.getMonth() - 1));
          break;
      }
      
      if (dateStart) {
        whereConditions.push('created_at >= $' + paramIndex++);
        queryParams.push(dateStart.toISOString());
      }
    }
    
    if (search) {
      whereConditions.push('(user_id::text LIKE $' + paramIndex + ' OR transaction_id LIKE $' + (paramIndex + 1) + ')');
      queryParams.push('%' + search + '%');
      queryParams.push('%' + search + '%');
    }
    
    const whereClause = whereConditions.length > 0 
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';
    
    // Get all matching transactions for export
    const query = `
      WITH combined_transactions AS (
        SELECT 
          'deposit' as type,
          d.id,
          d.user_id,
          u.username as user_username,
          u.first_name as user_name,
          d.transaction_id,
          d.amount_etb,
          d.points_received as points,
          d.status,
          d.payment_method,
          d.created_at,
          d.completed_at
        FROM deposits d
        LEFT JOIN telegram_users u ON u.id = d.user_id
        
        UNION ALL
        
        SELECT 
          'withdrawal' as type,
          w.id,
          w.user_id,
          u.username as user_username,
          u.first_name as user_name,
          w.transaction_id,
          w.amount_etb,
          w.points_deducted as points,
          w.status,
          w.account_type as payment_method,
          w.created_at,
          w.completed_at
        FROM withdrawals w
        LEFT JOIN telegram_users u ON u.id = w.user_id
        
        UNION ALL
        
        SELECT 
          'premium' as type,
          p.id,
          p.user_id,
          u.username as user_username,
          u.first_name as user_name,
          p.payment_reference as transaction_id,
          p.amount as amount_etb,
          NULL as points,
          p.status,
          p.provider as payment_method,
          p.created_at,
          p.updated_at as completed_at
        FROM premium_payments p
        LEFT JOIN telegram_users u ON u.id = p.user_id
      )
      SELECT * FROM combined_transactions
      ${whereClause}
      ORDER BY created_at DESC
    `;
    
    const result = await pool.query(query, queryParams);
    
    // Convert to CSV
    const csv = [
      'Type,Transaction ID,User ID,Username,Name,Amount (ETB),Points,Status,Payment Method,Created,Completed',
      ...result.rows.map(row => 
        `"${row.type}","${row.transaction_id}","${row.user_id}","${row.user_username || ''}","${row.user_name || ''}","${row.amount_etb}","${row.points || ''}","${row.status}","${row.payment_method || ''}","${new Date(row.created_at).toISOString()}","${row.completed_at ? new Date(row.completed_at).toISOString() : ''}"`
      )
    ].join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="transactions-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
    
  } catch (error) {
    console.error('Error exporting transactions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /admin/transactions/balance
// Get Chapa balance for monitoring
router.get('/balance', adminAuth, async (req, res) => {
  try {
    // Get Chapa API key
    const settingsResult = await pool.query(
      `SELECT value FROM settings WHERE key = 'chapa_api_key'`
    );
    
    const chapaApiKey = settingsResult.rows[0]?.value;
    
    if (!chapaApiKey || chapaApiKey === '0') {
      return res.json({
        success: false,
        message: 'Chapa API key not configured',
        balance: 0,
        currency: 'ETB'
      });
    }
    
    try {
      const response = await axios.get('https://api.chapa.co/v1/balances', {
        headers: {
          'Authorization': `Bearer ${chapaApiKey}`
        }
      });
      
      if (response.data && response.data.status === 'success' && response.data.data) {
        // Find ETB balance from the array
        const etbBalance = response.data.data.find(balance => balance.currency === 'ETB');
        
        // Get pending withdrawals count and total
        const pendingResult = await pool.query(`
          SELECT 
            COUNT(*) as pending_count,
            SUM(amount_etb) as pending_amount
          FROM withdrawals 
          WHERE status = 'pending' 
            AND (metadata->>'insufficient_balance')::boolean = true
        `);
        
        const pendingData = pendingResult.rows[0];
        
        res.json({
          success: true,
          balance: etbBalance ? parseFloat(etbBalance.available_balance || 0) : 0,
          ledger_balance: etbBalance ? parseFloat(etbBalance.ledger_balance || 0) : 0,
          currency: 'ETB',
          all_balances: response.data.data,
          pending_withdrawals: {
            count: parseInt(pendingData.pending_count || 0),
            total_amount: parseFloat(pendingData.pending_amount || 0)
          },
          last_updated: new Date().toISOString()
        });
      } else {
        res.json({
          success: false,
          message: 'Invalid response from Chapa',
          balance: 0,
          currency: 'ETB'
        });
      }
    } catch (chapaError) {
      console.error('Chapa balance check error:', chapaError.response?.data || chapaError.message);
      res.json({
        success: false,
        message: 'Failed to check Chapa balance',
        error: chapaError.message,
        balance: 0,
        currency: 'ETB'
      });
    }
  } catch (error) {
    console.error('Error checking balance:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /admin/transactions/process-pending
// Manually trigger processing of pending withdrawals
router.post('/process-pending', adminAuth, async (req, res) => {
  try {
    // Import the processing function from withdrawals module
    const withdrawalsModule = require('../api/withdrawals');
    
    if (withdrawalsModule.processPendingWithdrawals) {
      // Trigger processing in the background
      withdrawalsModule.processPendingWithdrawals().catch(error => {
        console.error('Error in manual processing trigger:', error);
      });
      
      res.json({
        success: true,
        message: 'Processing of pending withdrawals has been triggered'
      });
    } else {
      res.json({
        success: false,
        message: 'Processing function not available'
      });
    }
  } catch (error) {
    console.error('Error triggering pending withdrawals processing:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;