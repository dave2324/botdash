const express = require('express');
const pool = require('../config/database');
const adminAuth = require('../admin/auth');

const router = express.Router();

// GET /admin/promotion-participation/products
// Get all promotion products for admin
router.get('/products', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pp.*,
        json_agg(
          json_build_object(
            'id', ppt.id,
            'view_count', ppt.view_count,
            'points_reward', ppt.points_reward,
            'cash_reward', ppt.cash_reward,
            'description', ppt.description
          ) ORDER BY ppt.view_count
        ) as pricing_tiers
      FROM promotion_products pp
      LEFT JOIN promotion_pricing_tiers ppt ON pp.id = ppt.product_id
      GROUP BY pp.id
      ORDER BY pp.is_active DESC, pp.created_at DESC
    `);

    res.json({ 
      products: result.rows.map(row => ({
        ...row,
        pricing_tiers: row.pricing_tiers[0].id ? row.pricing_tiers : []
      }))
    });
  } catch (error) {
    console.error('Error fetching admin promotion products:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /admin/promotion-participation/products
// Create a new promotion product
router.post('/products', adminAuth, async (req, res) => {
  try {
    const { name, description, imageUrl, pricingTiers } = req.body;
    
    if (!name || !description || !pricingTiers || !Array.isArray(pricingTiers) || pricingTiers.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Insert product
      const productResult = await client.query(`
        INSERT INTO promotion_products (name, description, image_url, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [name, description, imageUrl || null, true]);
      
      const product = productResult.rows[0];
      
      // Insert pricing tiers
      for (const tier of pricingTiers) {
        await client.query(`
          INSERT INTO promotion_pricing_tiers 
            (product_id, view_count, points_reward, cash_reward, description)
          VALUES ($1, $2, $3, $4, $5)
        `, [
          product.id, 
          tier.view_count, 
          tier.points_reward || null, 
          tier.cash_reward || null,
          tier.description || null
        ]);
      }
      
      await client.query('COMMIT');
      
      // Return the full product with pricing tiers
      const fullProductResult = await client.query(`
        SELECT 
          pp.*,
          json_agg(
            json_build_object(
              'id', ppt.id,
              'view_count', ppt.view_count,
              'points_reward', ppt.points_reward,
              'cash_reward', ppt.cash_reward,
              'description', ppt.description
            ) ORDER BY ppt.view_count
          ) as pricing_tiers
        FROM promotion_products pp
        LEFT JOIN promotion_pricing_tiers ppt ON pp.id = ppt.product_id
        WHERE pp.id = $1
        GROUP BY pp.id
      `, [product.id]);
      
      res.status(201).json({ 
        message: 'Promotion product created successfully',
        product: {
          ...fullProductResult.rows[0],
          pricing_tiers: fullProductResult.rows[0].pricing_tiers[0].id ? 
            fullProductResult.rows[0].pricing_tiers : []
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating promotion product:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /admin/promotion-participation/products/:id
// Update an existing promotion product
router.put('/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, imageUrl, isActive, pricingTiers } = req.body;
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Update product
      const productResult = await client.query(`
        UPDATE promotion_products 
        SET 
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          image_url = $3,
          is_active = COALESCE($4, is_active),
          updated_at = NOW()
        WHERE id = $5
        RETURNING *
      `, [name, description, imageUrl, isActive, id]);
      
      if (productResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Product not found' });
      }
      
      // If pricing tiers are provided, update them
      if (pricingTiers && Array.isArray(pricingTiers)) {
        // Delete existing tiers
        await client.query('DELETE FROM promotion_pricing_tiers WHERE product_id = $1', [id]);
        
        // Insert new tiers
        for (const tier of pricingTiers) {
          await client.query(`
            INSERT INTO promotion_pricing_tiers 
              (product_id, view_count, points_reward, cash_reward, description)
            VALUES ($1, $2, $3, $4, $5)
          `, [
            id, 
            tier.view_count, 
            tier.points_reward || null, 
            tier.cash_reward || null,
            tier.description || null
          ]);
        }
      }
      
      await client.query('COMMIT');
      
      // Return the updated product with pricing tiers
      const fullProductResult = await client.query(`
        SELECT 
          pp.*,
          json_agg(
            json_build_object(
              'id', ppt.id,
              'view_count', ppt.view_count,
              'points_reward', ppt.points_reward,
              'cash_reward', ppt.cash_reward,
              'description', ppt.description
            ) ORDER BY ppt.view_count
          ) as pricing_tiers
        FROM promotion_products pp
        LEFT JOIN promotion_pricing_tiers ppt ON pp.id = ppt.product_id
        WHERE pp.id = $1
        GROUP BY pp.id
      `, [id]);
      
      res.json({ 
        message: 'Promotion product updated successfully',
        product: {
          ...fullProductResult.rows[0],
          pricing_tiers: fullProductResult.rows[0].pricing_tiers[0].id ? 
            fullProductResult.rows[0].pricing_tiers : []
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating promotion product:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /admin/promotion-participation/products/:id
// Delete a promotion product
router.delete('/products/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if there are any submissions for this product
    const submissionsCheck = await pool.query(
      'SELECT COUNT(*) FROM promotion_submissions WHERE product_id = $1',
      [id]
    );
    
    if (parseInt(submissionsCheck.rows[0].count) > 0) {
      // If submissions exist, just mark as inactive instead of deleting
      await pool.query(
        'UPDATE promotion_products SET is_active = FALSE WHERE id = $1',
        [id]
      );
      
      return res.json({ 
        message: 'Product has existing submissions and was marked inactive instead of deleted'
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Delete pricing tiers
      await client.query('DELETE FROM promotion_pricing_tiers WHERE product_id = $1', [id]);
      
      // Delete product
      const result = await client.query('DELETE FROM promotion_products WHERE id = $1 RETURNING id', [id]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Product not found' });
      }
      
      await client.query('COMMIT');
      
      res.json({ message: 'Promotion product deleted successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deleting promotion product:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /admin/promotion-participation/submissions
// Get all promotion submissions for admin with filtering
router.get('/submissions', adminAuth, async (req, res) => {
  try {
    const { status, product_id, user_id } = req.query;
    
    let query = `
      SELECT 
        ps.*,
        pp.name as product_name,
        pp.description as product_description,
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url
      FROM promotion_submissions ps
      JOIN promotion_products pp ON ps.product_id = pp.id
      JOIN telegram_users tu ON ps.user_id = tu.id
      WHERE 1=1
    `;
    
    const queryParams = [];
    
    if (status) {
      queryParams.push(status);
      query += ` AND ps.status = $${queryParams.length}`;
    }
    
    if (product_id) {
      queryParams.push(product_id);
      query += ` AND ps.product_id = $${queryParams.length}`;
    }
    
    if (user_id) {
      queryParams.push(user_id);
      query += ` AND ps.user_id = $${queryParams.length}`;
    }
    
    query += ` ORDER BY ps.created_at DESC`;
    
    const result = await pool.query(query, queryParams);
    
    res.json({ submissions: result.rows });
  } catch (error) {
    console.error('Error fetching promotion submissions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /admin/promotion-participation/submissions/:id/review
// Review a promotion submission (approve/reject)
router.put('/submissions/:id/review', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_notes, points_awarded, cash_awarded } = req.body;
    const admin_id = req.adminUser?.id;
    
    if (!status || !['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    // If approving, ensure there's either points or cash awarded
    if (status === 'approved' && !points_awarded && !cash_awarded) {
      return res.status(400).json({ message: 'Must specify points or cash reward when approving' });
    }
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Get submission details
      const submissionResult = await client.query(
        'SELECT * FROM promotion_submissions WHERE id = $1',
        [id]
      );
      
      if (submissionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Submission not found' });
      }
      
      const submission = submissionResult.rows[0];
      
      // Don't allow re-reviewing submissions
      if (submission.status !== 'pending') {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Submission is already ${submission.status}` });
      }
      
      // Update submission
      const updateResult = await client.query(`
        UPDATE promotion_submissions
        SET 
          status = $1,
          admin_notes = $2,
          points_awarded = $3,
          cash_awarded = $4,
          reviewed_at = NOW(),
          reviewed_by = $5,
          updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `, [
        status,
        admin_notes || null,
        points_awarded || null,
        cash_awarded || null,
        admin_id,
        id
      ]);
      
      // If approved and points awarded, add to user's balance
      if (status === 'approved' && points_awarded && points_awarded > 0) {
        await client.query(
          'SELECT add_points_to_user($1, $2)',
          [submission.user_id, points_awarded]
        );
      }
      
      await client.query('COMMIT');
      
      // Get full submission details
      const fullSubmissionResult = await client.query(`
        SELECT 
          ps.*,
          pp.name as product_name,
          pp.description as product_description,
          tu.username,
          tu.first_name,
          tu.last_name,
          tu.photo_url
        FROM promotion_submissions ps
        JOIN promotion_products pp ON ps.product_id = pp.id
        JOIN telegram_users tu ON ps.user_id = tu.id
        WHERE ps.id = $1
      `, [id]);
      
      // Send notification to the user
      const notificationMessage = status === 'approved' 
        ? `✅ Your promotion submission has been approved!\n\nProduct: ${fullSubmissionResult.rows[0].product_name}\nReward: ${points_awarded ? `${points_awarded} points` : ''} ${cash_awarded ? `${cash_awarded} ETB` : ''}\n${admin_notes ? `\nAdmin notes: ${admin_notes}` : ''}`
        : `❌ Your promotion submission has been rejected.\n\nProduct: ${fullSubmissionResult.rows[0].product_name}\n${admin_notes ? `\nReason: ${admin_notes}` : ''}`;
      
      // If you have a notification system, use it here
      // await sendBotNotification(submission.user_id, notificationMessage);
      
      res.json({ 
        message: `Submission ${status} successfully`,
        submission: fullSubmissionResult.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error reviewing promotion submission:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /admin/promotion-participation/users/:id/blacklist
// Blacklist/unblacklist a user from participating in promotions
router.put('/users/:id/blacklist', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { blacklisted, reason } = req.body;
    
    if (typeof blacklisted !== 'boolean') {
      return res.status(400).json({ message: 'Blacklisted status is required' });
    }
    
    // Update user
    const result = await pool.query(`
      UPDATE telegram_users
      SET 
        promotion_blacklisted = $1,
        promotion_blacklisted_reason = $2
      WHERE id = $3
      RETURNING id, username, first_name, last_name, promotion_blacklisted, promotion_blacklisted_reason
    `, [blacklisted, reason || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ 
      message: `User ${blacklisted ? 'blacklisted' : 'unblacklisted'} successfully`,
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating user blacklist status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
