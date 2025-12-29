const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { adminAuth } = require('./auth');
const { logger } = require('../config/logger');

/**
 * Get all promotion products with stats
 * GET /admin/promotion-products
 */
router.get('/', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pp.*,
        COALESCE(COUNT(ps.id), 0) AS total_submissions,
        COALESCE(COUNT(ps.id) FILTER (WHERE ps.status = 'approved'), 0) AS approved_submissions,
        COALESCE(COUNT(ps.id) FILTER (WHERE ps.status = 'pending'), 0) AS pending_submissions,
        COALESCE(COUNT(ps.id) FILTER (WHERE ps.status = 'rejected'), 0) AS rejected_submissions
      FROM promotion_products pp
      LEFT JOIN promotion_submissions ps ON pp.id = ps.product_id
      GROUP BY pp.id
      ORDER BY pp.created_at DESC
    `);

    // Get pricing tiers for each product
    const productIds = result.rows.map(product => product.id);
    let pricingTiers = [];
    
    if (productIds.length > 0) {
      const tiersResult = await pool.query(`
        SELECT * FROM promotion_pricing_tiers
        WHERE product_id = ANY($1)
        ORDER BY product_id, view_count ASC
      `, [productIds]);
      pricingTiers = tiersResult.rows;
    }

    // Group pricing tiers by product
    const productsWithTiers = result.rows.map(product => {
      return {
        ...product,
        pricing_tiers: pricingTiers.filter(tier => tier.product_id === product.id)
      };
    });

    res.json(productsWithTiers);
  } catch (error) {
    console.error('Error fetching promotion products:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Get a specific promotion product
 * GET /admin/promotion-products/:id
 */
router.get('/:id', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    // Get product details
    const productResult = await pool.query(`
      SELECT * FROM promotion_products WHERE id = $1
    `, [id]);

    if (productResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get pricing tiers
    const tiersResult = await pool.query(`
      SELECT * FROM promotion_pricing_tiers
      WHERE product_id = $1
      ORDER BY view_count ASC
    `, [id]);

    // Get submission stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) AS total_submissions,
        COUNT(*) FILTER (WHERE status = 'approved') AS approved_submissions,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_submissions,
        COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_submissions
      FROM promotion_submissions
      WHERE product_id = $1
    `, [id]);

    res.json({
      product: productResult.rows[0],
      pricing_tiers: tiersResult.rows,
      stats: statsResult.rows[0]
    });
  } catch (error) {
    console.error(`Error fetching promotion product ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Create a new promotion product
 * POST /admin/promotion-products
 */
router.post('/', adminAuth, async (req, res) => {
  try {
    const { name, description, image_url, product_link, is_active, pricing_tiers } = req.body;
    
    // Debug logging
    console.log('Creating promotion product with data:', { 
      name,
      description,
      pricing_tiers_count: pricing_tiers ? pricing_tiers.length : 0,
      pricing_tiers: pricing_tiers || []
    });

    // Validate required fields
    if (!name || !description) {
      return res.status(400).json({ message: 'Name and description are required' });
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert product
      const productResult = await client.query(`
        INSERT INTO promotion_products (name, description, image_url, product_link, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *
      `, [name, description, image_url || null, product_link || null, is_active !== false]);

      const productId = productResult.rows[0].id;

      // Insert pricing tiers if provided
      if (pricing_tiers && Array.isArray(pricing_tiers) && pricing_tiers.length > 0) {
        console.log(`Processing ${pricing_tiers.length} pricing tiers:`, pricing_tiers);
        
        for (const tier of pricing_tiers) {
          console.log('Processing tier:', tier);
          
          // Validate tier data
          if (!tier.view_count || (!tier.points_reward && !tier.cash_reward)) {
            console.error('Invalid tier data:', tier);
            throw new Error('Each pricing tier must have a view count and either a points or cash reward');
          }

          await client.query(`
            INSERT INTO promotion_pricing_tiers 
            (product_id, view_count, points_reward, cash_reward, description, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          `, [
            productId, 
            tier.view_count, 
            tier.points_reward || null, 
            tier.cash_reward || null,
            tier.description || null
          ]);
        }
      }

      await client.query('COMMIT');

      logger.info('New promotion product created', { 
        admin_id: req.admin ? req.admin.id : 'unknown',
        product_id: productId,
        product_name: name
      });

      // Get the complete product with pricing tiers
      const completeProductResult = await pool.query(`
        SELECT * FROM promotion_products WHERE id = $1
      `, [productId]);

      const tierResult = await pool.query(`
        SELECT * FROM promotion_pricing_tiers WHERE product_id = $1 ORDER BY view_count ASC
      `, [productId]);

      res.status(201).json({
        product: completeProductResult.rows[0],
        pricing_tiers: tierResult.rows
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error creating promotion product:', error);
    res.status(500).json({ 
      message: 'Failed to create promotion product',
      error: error.message
    });
  }
});

/**
 * Update a promotion product
 * PUT /admin/promotion-products/:id
 */
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    const { name, description, image_url, product_link, is_active, pricing_tiers } = req.body;

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if product exists
      const checkResult = await client.query('SELECT id FROM promotion_products WHERE id = $1', [id]);
      if (checkResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Product not found' });
      }

      // Update product
      const updateFields = [];
      const updateValues = [];
      let valueIndex = 1;

      if (name !== undefined) {
        updateFields.push(`name = $${valueIndex}`);
        updateValues.push(name);
        valueIndex++;
      }

      if (description !== undefined) {
        updateFields.push(`description = $${valueIndex}`);
        updateValues.push(description);
        valueIndex++;
      }

      if (image_url !== undefined) {
        updateFields.push(`image_url = $${valueIndex}`);
        updateValues.push(image_url);
        valueIndex++;
      }

      if (product_link !== undefined) {
        updateFields.push(`product_link = $${valueIndex}`);
        updateValues.push(product_link);
        valueIndex++;
      }

      if (is_active !== undefined) {
        updateFields.push(`is_active = $${valueIndex}`);
        updateValues.push(is_active);
        valueIndex++;
      }

      // Always update the updated_at timestamp
      updateFields.push(`updated_at = NOW()`);

      // Only proceed if there are fields to update
      if (updateFields.length > 0) {
        const updateQuery = `
          UPDATE promotion_products 
          SET ${updateFields.join(', ')}
          WHERE id = $${valueIndex}
          RETURNING *
        `;
        updateValues.push(id);
        await client.query(updateQuery, updateValues);
      }

      // Handle pricing tiers if provided
      if (pricing_tiers && Array.isArray(pricing_tiers)) {
        // First delete existing pricing tiers
        await client.query('DELETE FROM promotion_pricing_tiers WHERE product_id = $1', [id]);
        
        // Then insert new ones
        for (const tier of pricing_tiers) {
          // Skip invalid tiers
          if (!tier.view_count || (!tier.points_reward && !tier.cash_reward)) {
            continue;
          }

          await client.query(`
            INSERT INTO promotion_pricing_tiers 
            (product_id, view_count, points_reward, cash_reward, description, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
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

      logger.info('Promotion product updated', { 
        admin_id: req.admin ? req.admin.id : 'unknown',
        product_id: id
      });

      // Get the updated product with pricing tiers
      const updatedProductResult = await pool.query(`
        SELECT * FROM promotion_products WHERE id = $1
      `, [id]);

      const updatedTierResult = await pool.query(`
        SELECT * FROM promotion_pricing_tiers WHERE product_id = $1 ORDER BY view_count ASC
      `, [id]);

      res.json({
        product: updatedProductResult.rows[0],
        pricing_tiers: updatedTierResult.rows
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error updating promotion product ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Toggle product active status
 * PATCH /admin/promotion-products/:id/toggle
 */
router.patch('/:id/toggle', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    // Get current status
    const checkResult = await pool.query(
      'SELECT is_active FROM promotion_products WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const currentStatus = checkResult.rows[0].is_active;
    
    // Toggle status
    const result = await pool.query(
      'UPDATE promotion_products SET is_active = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [!currentStatus, id]
    );

    logger.info(`Promotion product ${currentStatus ? 'deactivated' : 'activated'}`, {
      admin_id: req.admin ? req.admin.id : 'unknown',
      product_id: id
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Error toggling promotion product ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Delete a promotion product
 * DELETE /admin/promotion-products/:id
 */
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: 'Invalid product ID' });
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if there are submissions for this product
      const submissionsCheck = await client.query(
        'SELECT COUNT(*) FROM promotion_submissions WHERE product_id = $1',
        [id]
      );

      // If there are submissions, don't delete but deactivate instead
      if (parseInt(submissionsCheck.rows[0].count) > 0) {
        await client.query(
          'UPDATE promotion_products SET is_active = FALSE WHERE id = $1',
          [id]
        );
        
        await client.query('COMMIT');
        
        logger.info('Promotion product deactivated instead of deleted due to existing submissions', {
          admin_id: req.admin ? req.admin.id : 'unknown',
          product_id: id
        });
        
        return res.json({ 
          message: 'Product cannot be deleted because submissions exist. It has been deactivated instead.',
          deactivated: true
        });
      }

      // Delete pricing tiers (should cascade, but being explicit)
      await client.query('DELETE FROM promotion_pricing_tiers WHERE product_id = $1', [id]);
      
      // Delete the product
      const result = await client.query('DELETE FROM promotion_products WHERE id = $1 RETURNING id', [id]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Product not found' });
      }

      await client.query('COMMIT');
      
      logger.info('Promotion product deleted', {
        admin_id: req.admin ? req.admin.id : 'unknown',
        product_id: id
      });
      
      res.json({ message: 'Product deleted successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(`Error deleting promotion product ${req.params.id}:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
