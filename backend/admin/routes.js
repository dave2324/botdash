const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const { adminAuth, checkPermission, superadminOnly, logAdminLogout } = require('./auth');
const { activityLogger } = require('./middleware/activity-logger');
const pool = require('../config/database');
const { Api } = require('telegram');
const {createBot} = require('../bot');
const { getYouTubeVideoInfo, getVideoDurationInSeconds } = require('../youtube');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads/promotion-products');
    // Ensure the directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'product-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Check file type
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Function to send bot notifications (single user)
const sendBotNotification = async (userId, message) => {
  try {
    const bot = await createBot();
    if (!bot || !bot.bot) {
      console.error('Bot instance not ready for notifications');
      return false;
    }

    await bot.bot.sendMessage(userId, message, {
      parse_mode: 'HTML'
    });
    return true;
  } catch (error) {
    console.error('Error sending bot notification:', error);
    return false;
  }
};

const router = express.Router();

// Import sub-routers
const affiliateTasksRouter = require('./affiliate-tasks');
const coursesRouter = require('./courses');
const localAdsRouter = require('./local-ads');
const flowsRouter = require('./flows');
const activityLogsModule = require('./activity-logs');
const adminUsersRouter = require('./admin-users');
const userRequestsRouter = require('./user-requests');
const inboxRouter = require('./inbox');

// Use sub-routers
router.use('/affiliate-tasks', affiliateTasksRouter);
router.use('/courses', coursesRouter);
router.use('/local-ads', localAdsRouter);
router.use('/flows', flowsRouter);
router.use('/staff', adminUsersRouter); // Admin users management
router.use('/user-requests', userRequestsRouter); // Admin inbox for user requests
router.use('/inbox', inboxRouter); // Full conversation inbox
router.use('/', activityLogsModule.router); // Activity logs routes

// Helper: send message/photo/video to a single user
const sendBotBroadcast = async (userId, payload) => {
  try {
    const bot = await createBot();
    if (!bot || !bot.bot) {
      console.error('Bot instance not ready for notifications');
      return false;
    }

    const {
      message,
      parse_mode = 'HTML',
      media_url,
      media_type
    } = payload;

    // Media optional
    if (media_url && media_type) {
      if (media_type === 'photo') {
        await bot.bot.sendPhoto(userId, media_url, {
          caption: message || undefined,
          parse_mode
        });
        return true;
      }

      if (media_type === 'video') {
        await bot.bot.sendVideo(userId, media_url, {
          caption: message || undefined,
          parse_mode
        });
        return true;
      }

      // Unknown media type
      return false;
    }

    // Text only
    if (!message) return false;
    await bot.bot.sendMessage(userId, message, { parse_mode });
    return true;
  } catch (error) {
    console.error('Error sending broadcast message:', error);
    return false;
  }
};

// Simple bulk messaging endpoint (text only)
// POST /admin/broadcast
// Body: { message: string, target?: 'all' | 'premium' | 'non_banned' }
router.post('/broadcast', adminAuth, async (req, res) => {
  try {
    const { message, target = 'all' } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    // Build basic filter
    let where = 'TRUE';
    const params = [];

    if (target === 'premium') {
      where = 'is_premium = TRUE AND is_banned = FALSE';
    } else if (target === 'non_banned') {
      where = 'is_banned = FALSE';
    }

    const usersResult = await pool.query(
      `SELECT id FROM telegram_users WHERE ${where}`,
      params
    );

    const userIds = usersResult.rows.map((u) => u.id);

    if (userIds.length === 0) {
      return res.status(200).json({
        sent: 0,
        failed: 0,
        message: 'No users matched the selected filter'
      });
    }

    let sent = 0;
    let failed = 0;

    // Send sequentially to avoid hitting rate limits too hard
    for (const id of userIds) {
      const ok = await sendBotNotification(id, message);
      if (ok) sent++;
      else failed++;
      // Small delay between messages
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return res.status(200).json({
      sent,
      failed,
      total: userIds.length
    });
  } catch (error) {
    console.error('Error in /admin/broadcast:', error);
    return res.status(500).json({ message: 'Server error while broadcasting' });
  }
});

// Rich broadcast endpoint (text + photo/video)
// POST /admin/broadcast-media
// Body: { message?: string, parse_mode?: 'HTML'|'Markdown', media_url?: string, media_type?: 'photo'|'video', target?: 'all'|'premium'|'non_banned' }
router.post('/broadcast-media', adminAuth, async (req, res) => {
  try {
    const {
      message,
      parse_mode,
      media_url,
      media_type,
      target = 'all'
    } = req.body || {};

    const hasText = typeof message === 'string' && message.trim().length > 0;
    const hasMedia = typeof media_url === 'string' && media_url.trim().length > 0 && (media_type === 'photo' || media_type === 'video');

    if (!hasText && !hasMedia) {
      return res.status(400).json({
        message: 'Provide message and/or media_url with media_type (photo|video)'
      });
    }

    // Build basic filter
    let where = 'TRUE';
    if (target === 'premium') {
      where = 'is_premium = TRUE AND is_banned = FALSE';
    } else if (target === 'non_banned') {
      where = 'is_banned = FALSE';
    }

    const usersResult = await pool.query(`SELECT id FROM telegram_users WHERE ${where}`);
    const userIds = usersResult.rows.map((u) => u.id);

    if (userIds.length === 0) {
      return res.status(200).json({
        sent: 0,
        failed: 0,
        message: 'No users matched the selected filter'
      });
    }

    let sent = 0;
    let failed = 0;

    for (const id of userIds) {
      const ok = await sendBotBroadcast(id, {
        message: hasText ? message : '',
        parse_mode: parse_mode || 'HTML',
        media_url: hasMedia ? media_url : undefined,
        media_type: hasMedia ? media_type : undefined
      });

      if (ok) sent++;
      else failed++;

      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return res.status(200).json({
      sent,
      failed,
      total: userIds.length
    });
  } catch (error) {
    console.error('Error in /admin/broadcast-media:', error);
    return res.status(500).json({ message: 'Server error while broadcasting media' });
  }
});

// --- WELCOME BLOCKS (ordered /start sequence) ---

// GET /admin/welcome-blocks
router.get('/welcome-blocks', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM welcome_blocks
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ blocks: result.rows });
  } catch (error) {
    console.error('Error fetching welcome blocks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /admin/welcome-blocks
// Body: { blocks: Array<{ id?: number, sort_order: number, is_active: boolean, block_type: string, payload: any }> }
router.put('/welcome-blocks', adminAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { blocks } = req.body || {};
    if (!Array.isArray(blocks)) {
      return res.status(400).json({ message: 'blocks must be an array' });
    }

    await client.query('BEGIN');

    // Replace all rows (simple + predictable)
    await client.query('DELETE FROM welcome_blocks');

    for (const b of blocks) {
      const sort_order = Number(b.sort_order) || 0;
      const is_active = b.is_active !== false;
      const block_type = String(b.block_type || '').trim();
      const payload = b.payload ?? {};

      if (!block_type) continue;

      await client.query(
        `INSERT INTO welcome_blocks (sort_order, is_active, block_type, payload, updated_at)
         VALUES ($1,$2,$3,$4,NOW())`,
        [sort_order, is_active, block_type, JSON.stringify(payload)]
      );
    }

    await client.query('COMMIT');

    const result = await pool.query(
      `SELECT * FROM welcome_blocks
       ORDER BY sort_order ASC, id ASC`
    );
    res.json({ blocks: result.rows });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving welcome blocks:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// --- ONBOARDING QUESTIONS ---

router.get('/onboarding/questions', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM onboarding_questions ORDER BY sort_order ASC, id ASC`
    );
    res.json({ questions: result.rows });
  } catch (error) {
    console.error('Error fetching onboarding questions:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/onboarding/questions', adminAuth, async (req, res) => {
  try {
    const {
      code,
      is_active = true,
      trigger = 'on_start',
      question_translations = {},
      type = 'text',
      options_translations = null,
      required = true,
      sort_order = 0
    } = req.body || {};

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ message: 'code is required' });
    }

    const result = await pool.query(
      `INSERT INTO onboarding_questions
        (code, is_active, trigger, question_translations, type, options_translations, required, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        code,
        !!is_active,
        trigger,
        JSON.stringify(question_translations),
        type,
        options_translations ? JSON.stringify(options_translations) : null,
        !!required,
        Number(sort_order) || 0
      ]
    );

    res.status(201).json({ question: result.rows[0] });
  } catch (error) {
    console.error('Error creating onboarding question:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/onboarding/questions/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
      is_active,
      trigger,
      question_translations,
      type,
      options_translations,
      required,
      sort_order
    } = req.body || {};

    const result = await pool.query(
      `UPDATE onboarding_questions
       SET code = COALESCE($1, code),
           is_active = COALESCE($2, is_active),
           trigger = COALESCE($3, trigger),
           question_translations = COALESCE($4, question_translations),
           type = COALESCE($5, type),
           options_translations = $6,
           required = COALESCE($7, required),
           sort_order = COALESCE($8, sort_order),
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [
        code ?? null,
        is_active === undefined ? null : !!is_active,
        trigger ?? null,
        question_translations === undefined ? null : JSON.stringify(question_translations),
        type ?? null,
        options_translations === undefined ? null : (options_translations ? JSON.stringify(options_translations) : null),
        required === undefined ? null : !!required,
        sort_order === undefined ? null : Number(sort_order),
        id
      ]
    );

    if (result.rows.length === 0) return res.status(404).json({ message: 'Question not found' });
    res.json({ question: result.rows[0] });
  } catch (error) {
    console.error('Error updating onboarding question:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/onboarding/questions/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM onboarding_questions WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: 'Question not found' });
    res.json({ message: 'Deleted', id: result.rows[0].id });
  } catch (error) {
    console.error('Error deleting onboarding question:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// View answers summary (admin)
router.get('/onboarding/answers', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         a.id,
         a.user_id,
         u.username,
         u.first_name,
         u.last_name,
         u.language_code,
         q.code as question_code,
         q.type as question_type,
         a.answer_text,
         a.answer_option_key,
         a.created_at
       FROM onboarding_answers a
       JOIN telegram_users u ON u.id = a.user_id
       JOIN onboarding_questions q ON q.id = a.question_id
       ORDER BY a.created_at DESC
       LIMIT 500`
    );

    res.json({ answers: result.rows });
  } catch (error) {
    console.error('Error fetching onboarding answers:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin login endpoint (env-based credentials)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    // Use DEFAULT_ADMIN_* variables with plain-text password as requested
    const envUsername = process.env.DEFAULT_ADMIN_USERNAME;
    const envPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    const jwtSecret = process.env.ADMIN_JWT_SECRET || 'dev-admin-secret';

    if (!envUsername || !envPassword) {
      console.error('DEFAULT_ADMIN_USERNAME or DEFAULT_ADMIN_PASSWORD not set in environment');
      return res.status(500).json({ message: 'Admin authentication is not configured on the server.' });
    }

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    // Validate against env-based credentials (plain-text comparison)
    const usernameMatches = username === envUsername;
    const passwordMatches = password === envPassword;

    if (!usernameMatches || !passwordMatches) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const userData = {
      id: 0,
      username: envUsername,
      role_name: 'superadmin',
      is_legacy: true
    };

    // Generate JWT token with user info
    const token = jwt.sign(
      {
        username: userData.username,
        role: userData.role_name,
        is_legacy: !!userData.is_legacy
      },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      username: userData.username,
      role: userData.role_name,
      role_id: userData.role_id,
      is_superadmin: true,
      isLegacy: !!userData.is_legacy
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin logout endpoint
router.post('/logout', adminAuth, async (req, res) => {
  try {
    // Log the logout activity
    if (req.admin && req.admin.id) {
      await logAdminLogout(
        req.admin.id,
        req.headers['x-forwarded-for'] || req.connection.remoteAddress
      );
    }
    
    res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users (with pagination)
router.get('/users', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const banned = req.query.banned === '1';
    const premium = req.query.premium;
    
    let whereClause = 'WHERE is_banned = $1';
    let params = [banned];
    let paramIndex = 2;
    
    // Add premium filter if specified
    if (premium !== undefined) {
      whereClause += ` AND is_premium = $${paramIndex}`;
      params.push(premium === '1');
      paramIndex++;
    }
    
    // Add limit and offset
    params.push(limit, offset);
    const limitParam = paramIndex;
    const offsetParam = paramIndex + 1;
    
    // Get users with pagination
    const usersResult = await pool.query(
      `SELECT 
        id, username, first_name, last_name, language_code, photo_url,
        points, referral_code, created_at, last_active, is_banned, is_premium, premium_until
      FROM telegram_users
      ${whereClause}
      ORDER BY last_active DESC
      LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );
    
    // Get total count with same filters
    let countParams = [banned];
    let countWhereClause = 'WHERE is_banned = $1';
    if (premium !== undefined) {
      countWhereClause += ' AND is_premium = $2';
      countParams.push(premium === '1');
    }
    
    const countResult = await pool.query(`SELECT COUNT(*) FROM telegram_users ${countWhereClause}`, countParams);
    
    res.json({
      users: usersResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
        pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all referrals (with pagination)
router.get('/referrals', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    // Get referrals with pagination
    const referralsResult = await pool.query(
      `SELECT 
        r.id, r.created_at, r.points_awarded,
        
        -- Referrer details
        r.referrer_id,
        referrer.username as referrer_username,
        referrer.first_name as referrer_first_name,
        referrer.last_name as referrer_last_name,
        referrer.photo_url as referrer_photo_url,
        
        -- Referred user details
        r.referred_id,
        referred.username as referred_username,
        referred.first_name as referred_first_name,
        referred.last_name as referred_last_name,
        referred.photo_url as referred_photo_url
        
      FROM referrals r
      JOIN telegram_users referrer ON referrer.id = r.referrer_id
      JOIN telegram_users referred ON referred.id = r.referred_id
      ORDER BY r.created_at DESC
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM referrals');
    
    res.json({
      referrals: referralsResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].count),
        page,
        limit,
        pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching referrals:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get referral by ID
router.get('/referrals/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const referralResult = await pool.query(
      `SELECT 
        r.id, r.created_at, r.points_awarded,
        
        -- Referrer details
        r.referrer_id,
        referrer.username as referrer_username,
        referrer.first_name as referrer_first_name,
        referrer.last_name as referrer_last_name,
        referrer.points as referrer_points,
        referrer.photo_url as referrer_photo_url,
        
        -- Referred user details
        r.referred_id,
        referred.username as referred_username,
        referred.first_name as referred_first_name,
        referred.last_name as referred_last_name,
        referred.points as referred_points,
        referred.photo_url as referred_photo_url
        
      FROM referrals r
      JOIN telegram_users referrer ON referrer.id = r.referrer_id
      JOIN telegram_users referred ON referred.id = r.referred_id
      WHERE r.id = $1`,
      [id]
    );
    
    if (referralResult.rows.length === 0) {
      return res.status(404).json({ message: 'Referral not found' });
    }
    
    res.json({
      referral: referralResult.rows[0]
    });
  } catch (error) {
    console.error('Error fetching referral details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user by ID with detailed statistics
router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user details
    const userResult = await pool.query(
      `SELECT * FROM user_statistics WHERE id = $1`,
      [id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get user's completed tasks
    const tasksResult = await pool.query(
      `SELECT t.id, t.type, t.description, ut.completed_at, ut.points_awarded
       FROM user_tasks ut
       JOIN tasks t ON t.id = ut.task_id
       WHERE ut.user_id = $1
       ORDER BY ut.completed_at DESC
       LIMIT 10`,
      [id]
    );
    
    // Get user's referrals
    const referralsResult = await pool.query(
      `SELECT 
        r.id, r.created_at, r.points_awarded,
        tu.id AS referred_user_id, tu.username AS referred_username,
        tu.first_name AS referred_first_name, tu.last_name AS referred_last_name,
        tu.photo_url AS referred_photo_url
       FROM referrals r
       JOIN telegram_users tu ON tu.id = r.referred_id
       WHERE r.referrer_id = $1
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [id]
    );
    
    res.json({
      user: userResult.rows[0],
      tasks: tasksResult.rows,
      referrals: referralsResult.rows
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user points manually
router.patch('/users/:id/points',
  adminAuth,
  activityLogger('adjust_points', 'user', 'id', (req) => ({
    points_change: req.body.points,
    reason: req.body.reason
  })),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { points, reason } = req.body;

    if (!points || isNaN(points)) {
      return res.status(400).json({ message: 'Valid points value required' });
    }

    // Get user's current points before update
    const userResult = await pool.query(
      'SELECT points FROM telegram_users WHERE id = $1',
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const balanceBefore = userResult.rows[0].points || 0;

    // Update user points using the stored function
    const result = await pool.query(
      'SELECT add_points_to_user($1, $2) as new_points',
      [id, points]
    );

    const balanceAfter = result.rows[0].new_points;

    // Log the points adjustment to enhanced_transaction_logs
    await pool.query(
      `INSERT INTO enhanced_transaction_logs
        (user_id, transaction_type, amount, balance_before, balance_after, description, admin_user_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        points > 0 ? 'admin_credit' : 'admin_debit',
        points,
        balanceBefore,
        balanceAfter,
        reason || `Manual balance adjustment by admin`,
        req.adminUser?.id || null,
        JSON.stringify({ adjusted_by: req.adminUser?.username || 'admin' })
      ]
    );

    res.json({
      message: 'Points updated successfully',
      newPoints: balanceAfter,
      updated: true
    });
  } catch (error) {
    console.error('Error updating points:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Ban or unban a user
router.patch('/users/:id/ban',
  adminAuth,
  activityLogger('moderate_user', 'user', 'id', (req) => ({
    action: req.body.is_banned ? 'banned' : 'unbanned'
  })),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { is_banned } = req.body;
    if (typeof is_banned !== 'boolean') {
      return res.status(400).json({ message: 'is_banned must be a boolean' });
    }
    const result = await pool.query(
      'UPDATE telegram_users SET is_banned = $1 WHERE id = $2 RETURNING *',
      [is_banned, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user: result.rows[0], message: is_banned ? 'User banned' : 'User unbanned' });
  } catch (error) {
    console.error('Error banning/unbanning user:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle premium status for a user
router.patch('/users/:id/premium',
  adminAuth,
  activityLogger('update_premium', 'user', 'id', (req) => ({
    action: req.body.is_premium ? 'granted_premium' : 'removed_premium',
    premium_until: req.body.premium_until
  })),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { is_premium, premium_until } = req.body;
    
    if (typeof is_premium !== 'boolean') {
      return res.status(400).json({ message: 'is_premium must be a boolean' });
    }
    
    let query, params;
    
    if (is_premium) {
      // If enabling premium, set premium_until to 30 days from now if not provided
      const until = premium_until || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      query = 'UPDATE telegram_users SET is_premium = $1, premium_until = $2 WHERE id = $3 RETURNING *';
      params = [true, until, id];
    } else {
      // If disabling premium, clear premium_until
      query = 'UPDATE telegram_users SET is_premium = $1, premium_until = NULL WHERE id = $2 RETURNING *';
      params = [false, id];
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ 
      user: result.rows[0], 
      message: is_premium ? 'Premium enabled' : 'Premium disabled' 
    });
  } catch (error) {
    console.error('Error toggling premium status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Ensure table exists (run this in setup-db or migration in production)
// CREATE TABLE youtube_tasks (
//   id SERIAL PRIMARY KEY,
//   youtube_url TEXT NOT NULL,
//   title TEXT NOT NULL,
//   thumbnail TEXT,
//   added_at TIMESTAMP DEFAULT NOW(),
//   expires_at TIMESTAMP,
//   disabled BOOLEAN DEFAULT FALSE,
// );

// List all YouTube video tasks
router.get('/youtube-tasks', adminAuth, async (req, res) => {
  try {
    // If includeUserPromotions=1, show only user submitted promotion videos
    // Otherwise, exclude them (yt.promotion_id IS NULL)
    const includeUserPromotions = req.query.includeUserPromotions === '1';
    let query = `
      SELECT yt.*, 
             (SELECT COUNT(*) FROM youtube_questions WHERE youtube_task_id = yt.id) as question_count,
             (SELECT COUNT(*) FROM task_progress 
              WHERE task_type = 'youtube_video' AND task_id = yt.id AND status = 'completed') as completion_count
      FROM youtube_tasks yt
      WHERE `;
    if (includeUserPromotions) {
      query += 'yt.promotion_id IS NOT NULL';
    } else {
      query += 'yt.promotion_id IS NULL';
    }
    query += '\n      ORDER BY yt.added_at DESC';
    const result = await pool.query(query);
    res.json({ tasks: result.rows });
  } catch (error) {
    console.error('Error fetching YouTube tasks:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new YouTube video task
router.post('/youtube-tasks',
  adminAuth,
  activityLogger('create', 'youtube_task', (req, data) => data.task?.id, (req) => ({
    youtube_url: req.body.youtube_url,
    title: req.body.title || 'YouTube Task',
    question_count: req.body.questions?.length || 0
  })),
  async (req, res) => {
  try {
    const { youtube_url, expires_at, questions, require_finish_task_id, require_finish_task_type, require_premium, vpn_countries, completion_limit } = req.body;
    if (!youtube_url) return res.status(400).json({ message: 'YouTube URL required' });
    
    // Extract video ID (YouTube or TikTok)
    const youtubeMatch = youtube_url.match(/(?:v=|youtu\.be\/|\/shorts\/)([\w-]{11})/);
    const tiktokMatch = youtube_url.match(/(?:tiktok\.com\/.*\/video\/|vm\.tiktok\.com\/|t\.tiktok\.com\/)([\w]+)/);

    if (!youtubeMatch && !tiktokMatch) {
      return res.status(400).json({ message: 'Invalid YouTube or TikTok URL' });
    }

    const videoId = youtubeMatch ? youtubeMatch[1] : tiktokMatch[1];
    const id = videoId;
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Use our YouTube module to get video info
      const videoInfo = await getYouTubeVideoInfo(id);
      
      // Convert ISO duration to seconds
      const videoDurationSecs = getVideoDurationInSeconds(videoInfo.duration_seconds);
      
      // Insert task with video info and requirement fields
      const taskResult = await client.query(
        'INSERT INTO youtube_tasks (youtube_url, title, thumbnail, expires_at, video_duration, require_finish_task_id, require_finish_task_type, require_premium, vpn_countries, completion_limit) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [youtube_url, videoInfo.title, videoInfo.thumbnail, expires_at || null, videoDurationSecs, require_finish_task_id || null, require_finish_task_type || null, require_premium || false, vpn_countries || [], completion_limit || null]
      );
      
      const task = taskResult.rows[0];
      
      // If questions are provided, add them to youtube_questions
      const addedQuestions = [];
      if (questions && Array.isArray(questions) && questions.length > 0) {
        for (const q of questions) {
          if (q.question && q.correct_answer) {
            const wrongAnswersArray = Array.isArray(q.wrong_answers) ? q.wrong_answers : 
                                     (q.wrong_answers ? [q.wrong_answers] : []);
            
            const questionResult = await client.query(
              'INSERT INTO youtube_questions (youtube_task_id, question, correct_answer, wrong_answers) VALUES ($1, $2, $3, $4) RETURNING *',
              [task.id, q.question, q.correct_answer, wrongAnswersArray]
            );
            
            addedQuestions.push(questionResult.rows[0]);
          }
        }
      }
      
      await client.query('COMMIT');
      
      res.status(201).json({ 
        task: task,
        questions: addedQuestions
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error fetching YouTube video info:', error);
      res.status(400).json({ message: 'Failed to fetch YouTube video info: ' + error.message });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error adding YouTube task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update/expire/disable a YouTube video task
router.patch('/youtube-tasks/:id',
  adminAuth,
  activityLogger('update', 'youtube_task', 'id', (req) => ({
    changes: Object.keys(req.body),
    disabled: req.body.disabled,
    expires_at: req.body.expires_at
  })),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { expires_at, disabled, video_duration, questions, require_finish_task_id, require_finish_task_type, require_premium, vpn_countries, completion_limit } = req.body;
    
    // Start a transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update the task
      const taskResult = await client.query(
        'UPDATE youtube_tasks SET expires_at = COALESCE($1, expires_at), disabled = COALESCE($2, disabled), video_duration = COALESCE($3, video_duration), require_finish_task_id = COALESCE($4, require_finish_task_id), require_finish_task_type = COALESCE($5, require_finish_task_type), require_premium = COALESCE($6, require_premium), vpn_countries = COALESCE($7, vpn_countries), completion_limit = COALESCE($8, completion_limit) WHERE id = $9 RETURNING *',
        [expires_at, disabled, video_duration, require_finish_task_id, require_finish_task_type, require_premium, vpn_countries, completion_limit, id]
      );
      
      if (taskResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Task not found' });
      }
      
      const task = taskResult.rows[0];
      
      // Handle questions update if provided
      let updatedQuestions = [];
      if (questions !== undefined) {
        // Get existing questions from DB
        const existingQuestionsRes = await client.query('SELECT id FROM youtube_questions WHERE youtube_task_id = $1', [id]);
        const existingIds = existingQuestionsRes.rows.map(q => q.id);
        // Get IDs from new questions array (if present)
        const newIds = Array.isArray(questions) ? questions.map(q => q.id).filter(Boolean) : [];
        // Delete questions that exist in DB but not in new array
        const idsToDelete = existingIds.filter(qid => !newIds.includes(qid));
        if (idsToDelete.length > 0) {
          // First delete any question responses for these questions
          await client.query(`DELETE FROM youtube_question_responses WHERE question_id = ANY($1::int[])`, [idsToDelete]);
          // Then delete the questions
          await client.query(`DELETE FROM youtube_questions WHERE id = ANY($1::int[])`, [idsToDelete]);
        }
        // Upsert new questions
        if (Array.isArray(questions) && questions.length > 0) {
          for (const q of questions) {
            const wrongAnswersArray = Array.isArray(q.wrong_answers) ? q.wrong_answers : (q.wrong_answers ? [q.wrong_answers] : []);
            if (q.id) {
              // Update existing question
              await client.query(
                'UPDATE youtube_questions SET question = $1, correct_answer = $2, wrong_answers = $3 WHERE id = $4',
                [q.question, q.correct_answer, wrongAnswersArray, q.id]
              );
            } else if (q.question && q.correct_answer) {
              // Insert new question
              const questionResult = await client.query(
                'INSERT INTO youtube_questions (youtube_task_id, question, correct_answer, wrong_answers) VALUES ($1, $2, $3, $4) RETURNING *',
                [id, q.question, q.correct_answer, wrongAnswersArray]
              );
              updatedQuestions.push(questionResult.rows[0]);
            }
          }
        }
        // Get all updated questions
        const questionsResult = await client.query('SELECT * FROM youtube_questions WHERE youtube_task_id = $1', [id]);
        updatedQuestions = questionsResult.rows;
      }
      
      await client.query('COMMIT');
      
      // Get the questions if not explicitly updated
      if (questions === undefined) {
        const questionsResult = await pool.query(
          'SELECT * FROM youtube_questions WHERE youtube_task_id = $1',
          [id]
        );
        updatedQuestions = questionsResult.rows;
      }
      
      res.json({ 
        task: task,
        questions: updatedQuestions
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error updating YouTube task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get YouTube task with questions
router.get('/youtube-tasks/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get task details
    const taskResult = await pool.query(
      `SELECT yt.*, 
              (SELECT COUNT(*) FROM task_progress 
               WHERE task_type = 'youtube_video' AND task_id = yt.id AND status = 'completed') as completion_count
       FROM youtube_tasks yt
       WHERE yt.id = $1`,
      [id]
    );
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    // Get questions if exists
    const questionsResult = await pool.query(
      'SELECT * FROM youtube_questions WHERE youtube_task_id = $1',
      [id]
    );
    
    // Get completion details
    const completionsResult = await pool.query(
      `SELECT 
         u.id, u.username, u.first_name, u.last_name, u.photo_url,
         tp.updated_at as completed_at,
         tp.metadata
       FROM task_progress tp
       JOIN telegram_users u ON u.id = tp.user_id
       WHERE tp.task_type = 'youtube_video' AND tp.task_id = $1 AND tp.status = 'completed'
       ORDER BY tp.updated_at DESC
       LIMIT 100`,
      [id]
    );
    
    res.json({
      task: taskResult.rows[0],
      questions: questionsResult.rows,
      completions: completionsResult.rows
    });
  } catch (error) {
    console.error('Error fetching YouTube task:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Refresh video info for a YouTube task
router.post('/youtube-tasks/:id/refresh-info', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the task
    const taskResult = await pool.query('SELECT youtube_url FROM youtube_tasks WHERE id = $1', [id]);
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ message: 'Task not found' });
    }
    
    const youtube_url = taskResult.rows[0].youtube_url;
    
    // Extract video ID (YouTube or TikTok)
    const youtubeMatch = youtube_url.match(/(?:v=|youtu\.be\/|\/shorts\/)([\w-]{11})/);
    const tiktokMatch = youtube_url.match(/(?:tiktok\.com\/.*\/video\/|vm\.tiktok\.com\/|t\.tiktok\.com\/)([\w]+)/);

    if (!youtubeMatch && !tiktokMatch) {
      return res.status(400).json({ message: 'Invalid YouTube or TikTok URL in task' });
    }

    const videoId = youtubeMatch ? youtubeMatch[1] : tiktokMatch[1];
    
    // Get updated info from YouTube API (only works for YouTube videos)
    try {
      if (!youtubeMatch) {
        return res.status(400).json({ message: 'Refresh info only available for YouTube videos' });
      }
      const videoInfo = await getYouTubeVideoInfo(videoId);
      
      // Convert ISO duration to seconds
      const videoDurationSecs = getVideoDurationInSeconds(videoInfo.duration_seconds);
      
      // Update the task with fresh information
      const updateResult = await pool.query(
        `UPDATE youtube_tasks 
         SET title = $1, 
             thumbnail = $2, 
             video_duration = $3,
             updated_at = NOW()
         WHERE id = $4 
         RETURNING *`,
        [videoInfo.title, videoInfo.thumbnail, videoDurationSecs, id]
      );
      
      res.json({ 
        message: 'Video info refreshed successfully',
        task: updateResult.rows[0] 
      });
    } catch (error) {
      console.error('Error fetching YouTube video info:', error);
      res.status(400).json({ message: 'Failed to refresh video info: ' + error.message });
    }
  } catch (error) {
    console.error('Error refreshing YouTube task info:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- TELEGRAM CHANNELS ---
// List all channels
router.get('/telegram-channels', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, 
             (SELECT COUNT(*) FROM task_progress 
              WHERE task_type = 'channel_join' AND task_id = c.id AND status = 'completed') as join_count
      FROM telegram_channels c
      WHERE c.promotion_id IS NULL
      ORDER BY c.created_at DESC
    `);
    res.json({ channels: result.rows });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single channel with analytics
router.get('/telegram-channels/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get channel details
    const channelResult = await pool.query(
      `SELECT c.*, 
              (SELECT COUNT(*) FROM task_progress 
               WHERE task_type = 'channel_join' AND task_id = c.id AND status = 'completed') as join_count
       FROM telegram_channels c
       WHERE c.id = $1`,
      [id]
    );
    
    if (channelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Channel not found' });
    }
    
    // Get join details
    const joinsResult = await pool.query(
      `SELECT 
         u.id, u.username, u.first_name, u.last_name, u.photo_url,
         tp.updated_at as joined_at
       FROM task_progress tp
       JOIN telegram_users u ON u.id = tp.user_id
       WHERE tp.task_type = 'channel_join' AND tp.task_id = $1 AND tp.status = 'completed'
       ORDER BY tp.updated_at DESC
       LIMIT 100`,
      [id]
    );
    
    res.json({
      channel: channelResult.rows[0],
      joins: joinsResult.rows
    });
  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add a new channel
router.post('/telegram-channels',
  adminAuth,
  activityLogger('create', 'telegram_channel', (req, data) => data.channel?.id, (req) => ({
    link: req.body.link,
    require_premium: req.body.require_premium || false
  })),
  async (req, res) => {
  try {
    let { link, expires_at, require_premium } = req.body;
    if (!link) {
      return res.status(400).json({ message: 'Channel link is required' });
    }

    // Clean and standardize the link format
    link = link.trim();
    
    // Extract username/channel ID from different link formats
    let channelIdentifier = '';
    if (link.includes('t.me/')) {
      // Handle t.me links
      const path = link.split('t.me/')[1].split('?')[0].split('/')[0];
      // Handle private links (https://t.me/+hash)
      if (path.startsWith('+')) {
        channelIdentifier = path; // Keep the + prefix for private links
      } else {
        channelIdentifier = path;
      }
    } else if (link.startsWith('@')) {
      // Handle @username format
      channelIdentifier = link.substring(1);
    } else if (link.startsWith('https://telegram.me/')) {
      // Handle telegram.me links
      const path = link.split('telegram.me/')[1].split('?')[0].split('/')[0];
      // Handle private links (https://telegram.me/+hash)
      if (path.startsWith('+')) {
        channelIdentifier = path; // Keep the + prefix for private links
      } else {
        channelIdentifier = path;
      }
    } else if (link.match(/^-100\d+$/)) {
      // Handle channel ID format (e.g., -1002490210049)
      channelIdentifier = link;
    } else {
      // Assume it's a direct username or channel ID
      channelIdentifier = link;
    }

    // Remove any trailing slashes or parameters
    channelIdentifier = channelIdentifier.replace(/\/+$/, '');
    const bot = await createBot();

    try {
      // Start bot if not already started
      if (!bot.isReady) {
        await bot.start();
      }

      // Get channel info using the new method
      const channelInfo = await bot.getChannelInfo(channelIdentifier);

      // Handle private channels (no username) vs public channels
      let channelName, standardLink, displayName;
      let isPublic = false;
      
      if (channelInfo.username) {
        // Public channel with username
        channelName = channelInfo.username;
        displayName = channelInfo.title;
        standardLink = `https://t.me/${channelInfo.username}`;
        isPublic = true;
      } else {
        // Private channel - use the original link or create a private link format
        channelName = channelIdentifier; // Use the identifier (e.g., +hash or -1001234567890)
        displayName = channelInfo.title; // Use the title for display
        isPublic = false;
        // For channel IDs, create a proper link format
        if (channelIdentifier.match(/^-100\d+$/)) {
          standardLink = `https://t.me/c/${channelIdentifier.substring(4)}/1`; // Remove -100 prefix
        } else {
          standardLink = link; // Keep the original link for other private channels
        }
      }

      // Check if channel already exists
      const existingChannel = await pool.query(
        'SELECT id FROM telegram_channels WHERE name = $1',
        [channelName]
      );

      if (existingChannel.rows.length > 0) {
        return res.status(400).json({ message: 'Channel already exists' });
      }

      // Insert channel with verified information
      const result = await pool.query(
        `INSERT INTO telegram_channels
          (name, title, link, is_public, is_private, disabled, expires_at, require_premium, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         RETURNING *`,
        [
          channelName,
          displayName,
          standardLink,
          isPublic,
          !isPublic, // is_private
          false, // disabled
          expires_at || null,
          require_premium || false
        ]
      );

      res.json({ 
        message: 'Channel added successfully',
        channel: result.rows[0]
      });
    } catch (error) {
      console.error('Error getting channel info:', error);
      const botUsername = process.env.BOT_USERNAME || 'your_bot';
      res.status(400).json({ 
        message: error.message || `Failed to verify channel. Make sure @${botUsername} is added as an admin of the channel and the channel exists.`
      });
    }
  } catch (error) {
    console.error('Error adding telegram channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit/disable/enable a channel
router.patch('/telegram-channels/:id',
  adminAuth,
  activityLogger('update', 'telegram_channel', 'id', (req) => ({
    changes: Object.keys(req.body),
    disabled: req.body.disabled,
    expires_at: req.body.expires_at
  })),
  async (req, res) => {
  try {
    const { id } = req.params;
    const { disabled, expires_at, require_finish_task_id, require_finish_task_type, require_premium } = req.body;
    const result = await pool.query(
      'UPDATE telegram_channels SET disabled = COALESCE($1, disabled), expires_at = $2, require_finish_task_id = COALESCE($3, require_finish_task_id), require_finish_task_type = COALESCE($4, require_finish_task_type), require_premium = COALESCE($5, require_premium) WHERE id = $6 RETURNING *',
      [disabled, expires_at, require_finish_task_id, require_finish_task_type, require_premium, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: 'Channel not found' });
    res.json({ channel: result.rows[0] });
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a channel
router.delete('/telegram-channels/:id',
  adminAuth,
  activityLogger('delete', 'telegram_channel', 'id'),
  async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if channel exists
    const channelResult = await pool.query(
      'SELECT id, name FROM telegram_channels WHERE id = $1',
      [id]
    );
    
    if (channelResult.rows.length === 0) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    // Delete related records first (to avoid foreign key constraint errors)
    await pool.query('DELETE FROM channel_membership_verifications WHERE channel_id = $1', [id]);

    // Delete the channel
    await pool.query('DELETE FROM telegram_channels WHERE id = $1', [id]);

    res.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Dashboard summary endpoint
router.get('/dashboard-summary', adminAuth, async (req, res) => {
  try {
    // Total users
    const usersResult = await pool.query('SELECT COUNT(*) FROM telegram_users');
    const totalUsers = parseInt(usersResult.rows[0].count, 10);

    // Active quizzes
    const quizzesResult = await pool.query("SELECT COUNT(*) FROM tasks WHERE type = 'quiz' AND is_active = TRUE");
    const activeQuizzes = parseInt(quizzesResult.rows[0].count, 10);

    // Video tasks (not disabled)
    const videoTasksResult = await pool.query('SELECT COUNT(*) FROM youtube_tasks WHERE disabled = FALSE');
    const videoTasks = parseInt(videoTasksResult.rows[0].count, 10);

    // Total points (sum of all points from all sources)
    const pointsResult = await pool.query(`
      SELECT COALESCE(
        (SELECT SUM(points) FROM telegram_users) +
        (SELECT COALESCE(SUM(points_awarded), 0) FROM user_tasks) +
        (SELECT COALESCE(SUM(points_awarded), 0) FROM referrals) +
        (SELECT COALESCE(SUM(points_awarded), 0) FROM spins),
        0
      ) as total_points
    `);
    const totalPoints = parseInt(pointsResult.rows[0].total_points, 10);

    res.json({ totalUsers, activeQuizzes, videoTasks, totalPoints });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Top users endpoint
router.get('/top-users', adminAuth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 5));
    const result = await pool.query(
      `SELECT id, username, first_name, last_name, photo_url, points, completed_tasks_count, referral_count
       FROM user_statistics
       ORDER BY points DESC, completed_tasks_count DESC, referral_count DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching top users:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Recent activities endpoint
router.get('/recent-activities', adminAuth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 20));
    const cursor = req.query.cursor ? new Date(req.query.cursor) : null;
    
    // Filter parameters
    const activityType = req.query.type; // 'task', 'custom_quiz', 'referral', 'spin'
    const taskType = req.query.task_type; // 'channel_join', 'video_watch', 'quiz', 'custom_quiz', 'referral', 'spin'
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
    const startDate = req.query.start_date ? new Date(req.query.start_date) : null;
    const endDate = req.query.end_date ? new Date(req.query.end_date) : null;
    
    // Build base query with static filters that don't need parameters
    let query = `
      WITH all_activities AS (
        -- Task completions from user_tasks (for backward compatibility)
      SELECT 
        'task' AS type,
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.photo_url,
        t.type AS task_type,
        CASE 
          WHEN t.type = 'channel_join' THEN CONCAT('Joined channel: ', t.description)
          WHEN t.type = 'video_watch' THEN CONCAT('Watched video: ', t.description)
          WHEN t.type = 'quiz' THEN CONCAT('Completed quiz: ', t.description)
          ELSE t.description
        END AS description,
        ut.points_awarded AS points,
          ut.completed_at AS activity_time
      FROM user_tasks ut
      JOIN tasks t ON t.id = ut.task_id
      JOIN telegram_users u ON u.id = ut.user_id
        WHERE 1=1
        ${activityType && activityType !== 'task' ? 'AND 1=0' : ''}
        ${taskType ? `AND t.type = '${taskType}'` : ''}
        ${userId ? `AND u.id = ${userId}` : ''}
        ${cursor ? `AND ut.completed_at < $2` : ''}
        ${startDate ? `AND ut.completed_at >= $${cursor ? 3 : 2}` : ''}
        ${endDate ? `AND ut.completed_at <= $${cursor ? (startDate ? 4 : 3) : (startDate ? 3 : 2)}` : ''}

        UNION ALL

        -- Video task completions from task_progress
        SELECT 
          'task' AS type,
          u.id AS user_id,
          u.username,
          u.first_name,
          u.last_name,
          u.photo_url,
          'video_watch' AS task_type,
          CONCAT('Watched video: ', yt.title) AS description,
          tp.points_earned AS points,
          tp.updated_at AS activity_time
        FROM task_progress tp
        JOIN telegram_users u ON u.id = tp.user_id
        JOIN youtube_tasks yt ON yt.id = tp.task_id
        WHERE tp.task_type = 'youtube_video' 
          AND tp.status = 'completed'
          ${activityType && activityType !== 'task' ? 'AND 1=0' : ''}
          ${taskType && taskType !== 'video_watch' ? 'AND 1=0' : ''}
          ${userId ? `AND u.id = ${userId}` : ''}
          ${cursor ? `AND tp.updated_at < $2` : ''}
          ${startDate ? `AND tp.updated_at >= $${cursor ? 3 : 2}` : ''}
          ${endDate ? `AND tp.updated_at <= $${cursor ? (startDate ? 4 : 3) : (startDate ? 3 : 2)}` : ''}

        UNION ALL

        -- Channel join completions from task_progress
        SELECT 
          'task' AS type,
          u.id AS user_id,
          u.username,
          u.first_name,
          u.last_name,
          u.photo_url,
          'channel_join' AS task_type,
          CONCAT('Joined channel: ', tc.name) AS description,
          tp.points_earned AS points,
          tp.updated_at AS activity_time
        FROM task_progress tp
        JOIN telegram_users u ON u.id = tp.user_id
        JOIN telegram_channels tc ON tc.id = tp.task_id
        WHERE tp.task_type = 'channel_join' 
          AND tp.status = 'completed'
          ${activityType && activityType !== 'task' ? 'AND 1=0' : ''}
          ${taskType && taskType !== 'channel_join' ? 'AND 1=0' : ''}
          ${userId ? `AND u.id = ${userId}` : ''}
          ${cursor ? `AND tp.updated_at < $2` : ''}
          ${startDate ? `AND tp.updated_at >= $${cursor ? 3 : 2}` : ''}
          ${endDate ? `AND tp.updated_at <= $${cursor ? (startDate ? 4 : 3) : (startDate ? 3 : 2)}` : ''}

      UNION ALL

      -- Custom quiz completions from user_quiz_attempts
      SELECT 
        'custom_quiz' AS type,
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.photo_url,
        'custom_quiz' AS task_type,
        CONCAT('Completed quiz: ', q.title) AS description,
        uqa.score AS points,
          uqa.completed_at AS activity_time
      FROM user_quiz_attempts uqa
      JOIN quizzes q ON q.id = uqa.quiz_id
      JOIN telegram_users u ON u.id = uqa.user_id
        WHERE 1=1
          ${activityType && activityType !== 'custom_quiz' ? 'AND 1=0' : ''}
          ${taskType && taskType !== 'custom_quiz' ? 'AND 1=0' : ''}
          ${userId ? `AND u.id = ${userId}` : ''}
          ${cursor ? `AND uqa.completed_at < $2` : ''}
          ${startDate ? `AND uqa.completed_at >= $${cursor ? 3 : 2}` : ''}
          ${endDate ? `AND uqa.completed_at <= $${cursor ? (startDate ? 4 : 3) : (startDate ? 3 : 2)}` : ''}

      UNION ALL

      -- Referral bonuses
      SELECT 
        'referral' AS type,
        referrer.id AS user_id,
        referrer.username,
        referrer.first_name,
        referrer.last_name,
        referrer.photo_url,
        'referral' AS task_type,
        CONCAT('Referred user: ', referred.first_name, 
          CASE 
            WHEN referred.username IS NOT NULL THEN CONCAT(' (@', referred.username, ')')
            ELSE ''
          END
        ) AS description,
        r.points_awarded AS points,
          r.created_at AS activity_time
      FROM referrals r
      JOIN telegram_users referrer ON referrer.id = r.referrer_id
      JOIN telegram_users referred ON referred.id = r.referred_id
        WHERE 1=1
          ${activityType && activityType !== 'referral' ? 'AND 1=0' : ''}
          ${taskType && taskType !== 'referral' ? 'AND 1=0' : ''}
          ${userId ? `AND referrer.id = ${userId}` : ''}
          ${cursor ? `AND r.created_at < $2` : ''}
          ${startDate ? `AND r.created_at >= $${cursor ? 3 : 2}` : ''}
          ${endDate ? `AND r.created_at <= $${cursor ? (startDate ? 4 : 3) : (startDate ? 3 : 2)}` : ''}

      UNION ALL

      -- Spin wheel rewards
      SELECT 
        'spin' AS type,
        u.id AS user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.photo_url,
        'spin' AS task_type,
        CONCAT('Spin wheel: ', s.result) AS description,
        s.points_awarded AS points,
          s.created_at AS activity_time
      FROM spins s
      JOIN telegram_users u ON u.id = s.user_id
        WHERE 1=1
          ${activityType && activityType !== 'spin' ? 'AND 1=0' : ''}
          ${taskType && taskType !== 'spin' ? 'AND 1=0' : ''}
          ${userId ? `AND u.id = ${userId}` : ''}
          ${cursor ? `AND s.created_at < $2` : ''}
          ${startDate ? `AND s.created_at >= $${cursor ? 3 : 2}` : ''}
          ${endDate ? `AND s.created_at <= $${cursor ? (startDate ? 4 : 3) : (startDate ? 3 : 2)}` : ''}
      )
      
      SELECT 
        type, 
        user_id, 
        username, 
        first_name, 
        last_name, 
        photo_url, 
        task_type, 
        description, 
        points, 
        activity_time AS timestamp
      FROM all_activities
      ORDER BY activity_time DESC
      LIMIT $1
    `;

    // Build parameters array
    const queryParams = [limit];
    if (cursor) queryParams.push(cursor);
    if (startDate) queryParams.push(startDate);
    if (endDate) queryParams.push(endDate);

    const result = await pool.query(query, queryParams);

    // Transform the results to include task type icons and formatted descriptions
    const activities = result.rows.map(activity => ({
      ...activity,
      task_icon: activity.task_type === 'channel_join' ? '📢' :
                 activity.task_type === 'video_watch' ? '🎥' :
                 activity.task_type === 'quiz' ? '❓' :
                 activity.task_type === 'custom_quiz' ? '🧩' :
                 activity.task_type === 'referral' ? '👥' :
                 activity.task_type === 'spin' ? '🎡' : '🎯'
    }));

    // Get the next cursor
    let nextCursor = null;
    if (activities.length === limit) {
      nextCursor = activities[activities.length - 1].timestamp;
    }

    res.json({
      activities,
      pagination: {
        nextCursor,
        hasMore: activities.length === limit
      }
    });
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- SETTINGS ROUTES ---
// Get all settings
router.get('/settings', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings ORDER BY key ASC');
    res.json({ settings: result.rows });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a setting
router.patch('/settings/:key', adminAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;
    
    if (value === null || value === undefined) {
      return res.status(400).json({ message: 'Value is required' });
    }

    // Convert value to string to support text column type
    const stringValue = String(value);

    // Upsert (create if missing)
    const result = await pool.query(
      `INSERT INTO settings (key, value, description, updated_at)
       VALUES ($1, $2, NULL, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
       RETURNING *`,
      [key, stringValue]
    );

    res.json({ setting: result.rows[0] });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Bulk update settings
router.post('/settings/bulk-update', adminAuth, async (req, res) => {
  try {
    const { settings } = req.body;
    
    if (!Array.isArray(settings)) {
      return res.status(400).json({ message: 'Settings must be an array' });
    }

    // Use sequential updates instead of Promise.all to avoid connection pool issues
    const updates = [];
    for (const { key, value } of settings) {
      if (value === null || value === undefined) {
        throw new Error(`Invalid value for ${key}: value is required`);
      }
      
      // Convert value to string to support text column type
      const stringValue = String(value);
      
      const result = await pool.query(
        `INSERT INTO settings (key, value, description, updated_at)
         VALUES ($1, $2, NULL, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
         RETURNING *`,
        [key, stringValue]
      );

      updates.push(result.rows[0]);
    }

    res.json({ settings: updates });
  } catch (error) {
    console.error('Error bulk updating settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- SPIN WHEEL ROUTES ---
// Get all spin wheel rewards
router.get('/spin-wheel/rewards', adminAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM spin_wheel_rewards ORDER BY position ASC'
    );
    res.json({ rewards: result.rows });
  } catch (error) {
    console.error('Error fetching spin wheel rewards:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update a spin wheel reward
router.patch('/spin-wheel/rewards/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, points, color, probability, is_active, position } = req.body;

    // Validate probability
    if (probability !== undefined && (probability < 0 || probability > 1)) {
      return res.status(400).json({ message: 'Probability must be between 0 and 1' });
    }

    const result = await pool.query(
      `UPDATE spin_wheel_rewards 
       SET label = COALESCE($1, label),
           points = COALESCE($2, points),
           color = COALESCE($3, color),
           probability = COALESCE($4, probability),
           is_active = COALESCE($5, is_active),
           position = COALESCE($6, position),
           updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [label, points, color, probability, is_active, position, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Reward not found' });
    }

    res.json({ reward: result.rows[0] });
  } catch (error) {
    console.error('Error updating spin wheel reward:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create a new spin wheel reward
router.post('/spin-wheel/rewards', adminAuth, async (req, res) => {
  try {
    const { label, points, color, probability, position } = req.body;

    if (!label || points === undefined || !color || position === undefined) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate probability
    if (probability !== undefined && (probability < 0 || probability > 1)) {
      return res.status(400).json({ message: 'Probability must be between 0 and 1' });
    }

    const result = await pool.query(
      `INSERT INTO spin_wheel_rewards 
       (label, points, color, probability, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [label, points, color, probability || 1.0, position]
    );

    res.status(201).json({ reward: result.rows[0] });
  } catch (error) {
    console.error('Error creating spin wheel reward:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete a spin wheel reward
router.delete('/spin-wheel/rewards/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM spin_wheel_rewards WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Reward not found' });
    }

    res.json({ message: 'Reward deleted successfully' });
  } catch (error) {
    console.error('Error deleting spin wheel reward:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset spin wheel rewards to default (handles foreign key constraints)
router.post('/spin-wheel/reset-to-default', adminAuth, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First, update any existing spins to reference a temporary placeholder or set to NULL
    // We'll set reward_id to NULL for existing spins to break the foreign key constraint
    await client.query('UPDATE spins SET reward_id = NULL WHERE reward_id IS NOT NULL');
    
    // Now we can safely delete all existing rewards
    await client.query('DELETE FROM spin_wheel_rewards');
    
    // Insert default rewards
    const defaultRewards = [
      { label: '5 Points', points: 5, color: '#18181b', probability: 0.25, position: 0 },
      { label: '10 Points', points: 10, color: '#18181b', probability: 0.20, position: 1 },
      { label: '25 Points', points: 25, color: '#18181b', probability: 0.15, position: 2 },
      { label: '50 Points', points: 50, color: '#18181b', probability: 0.12, position: 3 },
      { label: '100 Points', points: 100, color: '#18181b', probability: 0.10, position: 4 },
      { label: '200 Points', points: 200, color: '#dc2626', probability: 0.08, position: 5 },
      { label: '500 Points', points: 500, color: '#facc15', probability: 0.05, position: 6 },
      { label: 'Free Spin', points: 0, color: '#18181b', probability: 0.05, position: 7 },
    ];
    
    const insertedRewards = [];
    for (const reward of defaultRewards) {
      const result = await client.query(
        `INSERT INTO spin_wheel_rewards (label, points, color, probability, is_active, position, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, true, $5, NOW(), NOW()) RETURNING *`,
        [reward.label, reward.points, reward.color, reward.probability, reward.position]
      );
      insertedRewards.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    res.json({ 
      message: 'Successfully reset to default rewards',
      rewards: insertedRewards 
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error resetting to default rewards:', error);
    res.status(500).json({ message: 'Failed to reset to default rewards' });
  } finally {
    client.release();
  }
});

// Reorder spin wheel rewards
router.post('/spin-wheel/rewards/reorder', adminAuth, async (req, res) => {
  try {
    const { rewards } = req.body;

    if (!Array.isArray(rewards)) {
      return res.status(400).json({ message: 'Rewards must be an array' });
    }

    const updates = await Promise.all(
      rewards.map(async ({ id, position }) => {
        const result = await pool.query(
          'UPDATE spin_wheel_rewards SET position = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [position, id]
        );
        return result.rows[0];
      })
    );

    res.json({ rewards: updates });
  } catch (error) {
    console.error('Error reordering rewards:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- SPIN WHEEL USER ROUTES ---
// Get active spin wheel rewards for users
router.get('/api/spin-wheel/rewards', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, label, points, color, probability, position FROM spin_wheel_rewards WHERE is_active = TRUE ORDER BY position ASC'
    );
    res.json({ rewards: result.rows });
  } catch (error) {
    console.error('Error fetching spin wheel rewards:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Spin the wheel and get a reward
router.post('/api/spin-wheel/spin', async (req, res) => {
  try {
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT id FROM telegram_users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get active rewards with their probabilities
    const rewardsResult = await pool.query(
      'SELECT id, label, points, probability FROM spin_wheel_rewards WHERE is_active = TRUE ORDER BY position ASC'
    );

    if (rewardsResult.rows.length === 0) {
      return res.status(400).json({ message: 'No active rewards available' });
    }

    // Calculate total probability
    const totalProbability = rewardsResult.rows.reduce((sum, reward) => sum + (reward.probability || 1), 0);

    // Generate random number between 0 and total probability
    const random = Math.random() * totalProbability;

    // Select reward based on probability
    let currentSum = 0;
    let selectedReward = rewardsResult.rows[0]; // Default to first reward
    
    for (const reward of rewardsResult.rows) {
      currentSum += (reward.probability || 1);
      if (random <= currentSum) {
        selectedReward = reward;
        break;
      }
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Record the spin
      const spinResult = await client.query(
        `INSERT INTO spins (user_id, reward_id, result, points_awarded, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING id`,
        [user_id, selectedReward.id, selectedReward.label, selectedReward.points]
      );

      // Add points to user
      await client.query(
        'SELECT add_points_to_user($1, $2)',
        [user_id, selectedReward.points]
      );

      await client.query('COMMIT');

      res.json({
        success: true,
        reward: {
          id: selectedReward.id,
          label: selectedReward.label,
          points: selectedReward.points
        },
        spin_id: spinResult.rows[0].id
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error processing spin:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's spin history
router.get('/api/spin-wheel/history/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await pool.query(
      `SELECT s.id, s.result, s.points_awarded, s.created_at,
              r.label, r.color
       FROM spins s
       JOIN spin_wheel_rewards r ON r.id = s.reward_id
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT 10`,
      [user_id]
    );
    res.json({ history: result.rows });
  } catch (error) {
    console.error('Error fetching spin history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// --- QUIZ ROUTES ---
// Get all quizzes with stats
router.get('/quizzes', adminAuth, async (req, res) => {
  try {
    const { category } = req.query;
    
    let categoryFilter = '';
    let queryParams = [];
    
    if (category && category !== 'Uncategorized') {
      categoryFilter = 'WHERE q.category = $1';
      queryParams.push(category);
    } else if (category === 'Uncategorized') {
      categoryFilter = 'WHERE (q.category IS NULL OR q.category = \'\')';
    }
    
    const result = await pool.query(`
      SELECT 
        q.id,
        q.title,
        q.hashtags,
        q.category,
        q.points_per_question,
        q.is_active,
        q.created_at,
        q.updated_at,
        COUNT(qq.id) as question_count,
        COALESCE(stats.attempt_count, 0) as attempt_count,
        COALESCE(stats.avg_score, 0) as avg_score
      FROM quizzes q
      LEFT JOIN quiz_questions qq ON q.id = qq.quiz_id
      LEFT JOIN (
        SELECT 
          quiz_id,
          COUNT(*) as attempt_count,
          AVG(score) as avg_score
        FROM user_quiz_attempts
        GROUP BY quiz_id
      ) stats ON stats.quiz_id = q.id
      ${categoryFilter}
      GROUP BY q.id, stats.attempt_count, stats.avg_score
      ORDER BY q.created_at DESC
    `, queryParams);

    res.json({ quizzes: result.rows });
  } catch (error) {
    console.error('Error fetching quizzes:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get quiz categories
router.get('/quizzes/categories', adminAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT DISTINCT category FROM quizzes WHERE category IS NOT NULL AND category != \'\' ORDER BY category ASC');
    const categories = result.rows.map(row => row.category || 'Uncategorized');
    
    // Add 'Uncategorized' if there are quizzes without categories
    const uncategorizedResult = await pool.query('SELECT COUNT(*) FROM quizzes WHERE category IS NULL OR category = \'\'');
    if (parseInt(uncategorizedResult.rows[0].count) > 0) {
      categories.unshift('Uncategorized');
    }
    
    res.json({ categories });
  } catch (error) {
    console.error('Error fetching quiz categories:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single quiz with questions
router.get('/quizzes/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get quiz details
    const quizResult = await pool.query(
      'SELECT * FROM quizzes WHERE id = $1',
      [id]
    );

    if (quizResult.rows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Get quiz questions
    const questionsResult = await pool.query(
      'SELECT * FROM quiz_questions WHERE quiz_id = $1 ORDER BY id ASC',
      [id]
    );

    // Get quiz stats
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) as attempt_count,
        AVG(score) as avg_score,
        MAX(score) as high_score
      FROM user_quiz_attempts
      WHERE quiz_id = $1
    `, [id]);

    res.json({
      quiz: {
        ...quizResult.rows[0],
        questions: questionsResult.rows,
        stats: statsResult.rows[0]
      }
    });
  } catch (error) {
    console.error('Error fetching quiz:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new quiz
router.post('/quizzes',
  adminAuth,
  activityLogger('create', 'quiz', (req, data) => data.quiz?.id, (req) => ({
    title: req.body.title,
    category: req.body.category,
    question_count: req.body.questions?.length || 0
  })),
  async (req, res) => {
  const client = await pool.connect();
  try {
    const { title, hashtags, points_per_question, questions, category } = req.body;

    if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'Title and at least one question are required' });
    }

    await client.query('BEGIN');

    // Create quiz
    const quizResult = await client.query(
      'INSERT INTO quizzes (title, hashtags, points_per_question, category) VALUES ($1, $2, $3, $4) RETURNING *',
      [title, hashtags || [], points_per_question || 10, category || null]
    );

    const quiz = quizResult.rows[0];

    // Add questions
    const questionPromises = questions.map(q => 
      client.query(
        'INSERT INTO quiz_questions (quiz_id, question_text, correct_answer, wrong_answers) VALUES ($1, $2, $3, $4) RETURNING *',
        [quiz.id, q.question_text, q.correct_answer, q.wrong_answers]
      )
    );

    const questionResults = await Promise.all(questionPromises);
    const savedQuestions = questionResults.map(r => r.rows[0]);

    await client.query('COMMIT');

    res.status(201).json({
      quiz: {
        ...quiz,
        questions: savedQuestions
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating quiz:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Update quiz
router.put('/quizzes/:id',
  adminAuth,
  activityLogger('update', 'quiz', 'id', (req) => ({
    title: req.body.title,
    changes: Object.keys(req.body),
    is_active: req.body.is_active
  })),
  async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { title, hashtags, points_per_question, is_active, questions, require_finish_task_id, require_finish_task_type, category } = req.body;
    await client.query('BEGIN');
    // Update quiz
    const quizResult = await client.query(
      `UPDATE quizzes 
       SET title = COALESCE($1, title),
           hashtags = COALESCE($2, hashtags),
           points_per_question = COALESCE($3, points_per_question),
           is_active = COALESCE($4, is_active),
           updated_at = NOW(),
           require_finish_task_id = COALESCE($5, require_finish_task_id),
           require_finish_task_type = COALESCE($6, require_finish_task_type),
           category = COALESCE($7, category)
       WHERE id = $8
       RETURNING *`,
      [title, hashtags, points_per_question, is_active, require_finish_task_id, require_finish_task_type, category, id]
    );

    if (quizResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // If questions provided, update them
    if (questions && Array.isArray(questions)) {
      // Delete existing questions
      await client.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [id]);

      // Add new questions
      const questionPromises = questions.map(q =>
        client.query(
          'INSERT INTO quiz_questions (quiz_id, question_text, correct_answer, wrong_answers) VALUES ($1, $2, $3, $4) RETURNING *',
          [id, q.question_text, q.correct_answer, q.wrong_answers]
        )
      );

      const questionResults = await Promise.all(questionPromises);
      const savedQuestions = questionResults.map(r => r.rows[0]);

      await client.query('COMMIT');

      res.json({
        quiz: {
          ...quizResult.rows[0],
          questions: savedQuestions
        }
      });
    } else {
      await client.query('COMMIT');
      res.json({ quiz: quizResult.rows[0] });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating quiz:', error);
    res.status(500).json({ message: 'Server error' });
  } finally {
    client.release();
  }
});

// Delete quiz
router.delete('/quizzes/:id',
  adminAuth,
  activityLogger('delete', 'quiz', 'id'),
  async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM quizzes WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Error deleting quiz:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



// Get quiz attempts for a specific quiz
router.get('/quizzes/:id/attempts', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // First check if quiz exists
    const quizResult = await pool.query(
      'SELECT id, title FROM quizzes WHERE id = $1',
      [id]
    );

    if (quizResult.rows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Get attempts with pagination
    const attemptsResult = await pool.query(
      `SELECT 
        uqa.id,
        uqa.user_id,
        u.username,
        u.first_name,
        u.last_name,
        u.photo_url,
        uqa.score,
        uqa.correct_answers,
        uqa.total_questions,
        CASE 
          WHEN uqa.total_questions > 0 THEN 
            ROUND((uqa.correct_answers::numeric / uqa.total_questions) * 100)
          ELSE 0
        END AS percentage_correct,
        uqa.completed_at,
        tp.metadata
      FROM user_quiz_attempts uqa
      JOIN telegram_users u ON u.id = uqa.user_id
      LEFT JOIN task_progress tp ON 
        tp.user_id = uqa.user_id AND
        tp.task_type = 'quiz' AND
        tp.task_id = uqa.quiz_id
      WHERE uqa.quiz_id = $1
      ORDER BY uqa.completed_at DESC
      LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM user_quiz_attempts WHERE quiz_id = $1',
      [id]
    );

    const totalCount = parseInt(countResult.rows[0].count);

    res.json({
      quiz: quizResult.rows[0],
      attempts: attemptsResult.rows,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching quiz attempts:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get join analytics (joins per day) for a channel
router.get('/telegram-channels/:id/analytics', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    // Group join completions by day
    const result = await pool.query(
      `SELECT 
         DATE(tp.updated_at) as date,
         COUNT(*) as count
       FROM task_progress tp
       WHERE tp.task_type = 'channel_join' AND tp.task_id = $1 AND tp.status = 'completed'
       GROUP BY DATE(tp.updated_at)
       ORDER BY date ASC`,
      [id]
    );
    res.json({ join_counts: result.rows });
  } catch (error) {
    console.error('Error fetching channel analytics:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// User Submitted Promotions Routes
router.get('/user-promotions', adminAuth, async (req, res) => {
  try {
    const { status, type, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    let queryParams = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      whereClause += ` AND usp.status = $${paramCount}`;
      queryParams.push(status);
    }
    
    if (type) {
      paramCount++;
      whereClause += ` AND usp.type = $${paramCount}`;
      queryParams.push(type);
    }
    
    // Get promotions with user info
    const result = await pool.query(`
      SELECT 
        usp.*,
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url,
        COUNT(upe.id) as total_engagements
      FROM user_submitted_promotions usp
      LEFT JOIN telegram_users tu ON usp.user_id = tu.id
      LEFT JOIN user_promotion_engagements upe ON usp.id = upe.promotion_id
      ${whereClause}
      GROUP BY usp.id, tu.username, tu.first_name, tu.last_name, tu.photo_url
      ORDER BY usp.created_at DESC
      LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}
    `, [...queryParams, limit, offset]);
    
    // Get total count
    const countResult = await pool.query(`
      SELECT COUNT(*) FROM user_submitted_promotions usp ${whereClause}
    `, queryParams);
    
    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / limit);
    
    res.json({
      promotions: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages
      }
    });
  } catch (error) {
    console.error('Error fetching user promotions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/user-promotions/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        usp.*,
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url
      FROM user_submitted_promotions usp
      LEFT JOIN telegram_users tu ON usp.user_id = tu.id
      WHERE usp.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Promotion not found' });
    }
    
    const promotion = result.rows[0];
    
    // Get engagements for this promotion
    const engagementsResult = await pool.query(`
      SELECT 
        upe.*,
        tu.username,
        tu.first_name,
        tu.last_name,
        tu.photo_url
      FROM user_promotion_engagements upe
      LEFT JOIN telegram_users tu ON upe.user_id = tu.id
      WHERE upe.promotion_id = $1
      ORDER BY upe.created_at DESC
    `, [id]);
    
    // Get linked tasks based on promotion type
    let linkedTask = null;
    
    if (promotion.type === 'channel_join' && promotion.status !== 'pending') {
      const channelResult = await pool.query(`
        SELECT * FROM telegram_channels WHERE promotion_id = $1
      `, [id]);
      
      if (channelResult.rows.length > 0) {
        linkedTask = {
          type: 'channel',
          data: channelResult.rows[0]
        };
      }
    } else if (promotion.type === 'video_boost' && promotion.status !== 'pending') {
      const videoResult = await pool.query(`
        SELECT * FROM youtube_tasks WHERE promotion_id = $1
      `, [id]);
      
      if (videoResult.rows.length > 0) {
        const videoTask = videoResult.rows[0];
        
        // Get questions for this video task
        const questionsResult = await pool.query(`
          SELECT * FROM youtube_questions WHERE youtube_task_id = $1
        `, [videoTask.id]);
        
        linkedTask = {
          type: 'video',
          data: {
            ...videoTask,
            questions: questionsResult.rows
          }
        };
      }
    }
    
    res.json({
      promotion: promotion,
      engagements: engagementsResult.rows,
      linkedTask: linkedTask
    });
  } catch (error) {
    console.error('Error fetching user promotion:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/user-promotions/:id/approve', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes, validation_questions } = req.body;
    
    // Use a transaction to ensure all operations succeed or fail together
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get promotion settings based on type
      const promotionInfo = await client.query(`
        SELECT * FROM user_submitted_promotions WHERE id = $1 AND status = 'pending'
      `, [id]);
      
      if (promotionInfo.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Promotion not found or already processed' });
      }
      
      const promotionData = promotionInfo.rows[0];
      
      // Make sure we have the reward and cost settings
      if (!promotionData.reward_per_action || !promotionData.cost_per_action) {
        // If missing, get from settings and update
        const settingsResult = await client.query(`
          SELECT 
            (SELECT value FROM settings WHERE key = $1) as reward_per_action,
            (SELECT value FROM settings WHERE key = $2) as admin_profit_per_action
        `, [
          promotionData.type === 'channel_join' ? 'channel_join_reward_points' : 'video_boost_reward_points',
          promotionData.type === 'channel_join' ? 'channel_join_admin_profit' : 'video_boost_admin_profit'
        ]);
        
        const rewardPerAction = parseInt(settingsResult.rows[0].reward_per_action);
        const adminProfitPerAction = parseInt(settingsResult.rows[0].admin_profit_per_action);
        const costPerAction = rewardPerAction + adminProfitPerAction;
        
        // Update the promotion with these values
        await client.query(`
          UPDATE user_submitted_promotions
          SET reward_per_action = $1,
              admin_profit_per_action = $2,
              cost_per_action = $3
          WHERE id = $4
        `, [rewardPerAction, adminProfitPerAction, costPerAction, id]);
        
        // Reload the promotion data with updated values
        const updatedPromotionInfo = await client.query(`
          SELECT * FROM user_submitted_promotions WHERE id = $1
        `, [id]);
        promotionData = updatedPromotionInfo.rows[0];
      }
      
      // Now approve the promotion
      const result = await client.query(`
        UPDATE user_submitted_promotions 
        SET status = 'approved', admin_notes = $1, validation_questions = $2, approved_at = NOW(), updated_at = NOW()
        WHERE id = $3 AND status = 'pending'
        RETURNING *
      `, [admin_notes || null, validation_questions ? JSON.stringify(validation_questions) : null, id]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Promotion not found or already processed' });
      }
      
      const promotion = result.rows[0] || promotionData;
      
      // Create corresponding task based on promotion type
      if (promotion.type === 'channel_join') {
        // Extract channel name from target_url
        let channelIdentifier = '';
        const link = promotion.target_url.trim();
        
        if (link.includes('t.me/')) {
          // Handle t.me links
          const path = link.split('t.me/')[1].split('?')[0].split('/')[0];
          // Handle private links (https://t.me/+hash)
          if (path.startsWith('+')) {
            channelIdentifier = path; // Keep the + prefix for private links
          } else {
            channelIdentifier = path;
          }
        } else if (link.startsWith('@')) {
          // Handle @username format
          channelIdentifier = link.substring(1);
        } else if (link.startsWith('https://telegram.me/')) {
          // Handle telegram.me links
          const path = link.split('telegram.me/')[1].split('?')[0].split('/')[0];
          // Handle private links (https://telegram.me/+hash)
          if (path.startsWith('+')) {
            channelIdentifier = path; // Keep the + prefix for private links
          } else {
            channelIdentifier = path;
          }
        } else if (link.match(/^-100\d+$/)) {
          // Handle channel ID format (e.g., -1002490210049)
          channelIdentifier = link;
        } else {
          // Assume it's a direct username or channel ID
          channelIdentifier = link;
        }
        
        // Remove any trailing slashes or parameters
        channelIdentifier = channelIdentifier.replace(/\/+$/, '');
        
        // Get channel info to determine if it's public or private
        const bot = await createBot();
        if (!bot.isReady) {
          await bot.start();
        }
        
        const channelInfo = await bot.getChannelInfo(channelIdentifier);
        
        // Determine channel properties
        let channelName, standardLink, displayName;
        let isPublic = false;
        
        if (channelInfo.username) {
          // Public channel with username
          channelName = channelInfo.username;
          displayName = channelInfo.title || promotion.title;
          standardLink = `https://t.me/${channelInfo.username}`;
          isPublic = true;
        } else {
          // Private channel - use the original link or create a private link format
          channelName = channelIdentifier;
          displayName = channelInfo.title || promotion.title;
          isPublic = false;
          // For channel IDs, create a proper link format
          if (channelIdentifier.match(/^-100\d+$/)) {
            standardLink = `https://t.me/c/${channelIdentifier.substring(4)}/1`; // Remove -100 prefix
          } else {
            standardLink = link; // Keep the original link for other private channels
          }
        }
        
        // Insert into telegram_channels
        const channelResult = await client.query(`
          INSERT INTO telegram_channels 
            (name, title, link, is_public, is_private, disabled, expires_at, promotion_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          channelName,
          displayName,
          standardLink,
          isPublic, // is_public
          !isPublic, // is_private
          false, // disabled
          promotion.expires_at,
          promotion.id
        ]);


      } else if (promotion.type === 'video_boost') {
        // Extract video info
        const youtubeMatch = promotion.target_url.match(/(?:v=|youtu\.be\/|\/shorts\/)([\w-]{11})/);
        const tiktokMatch = promotion.target_url.match(/(?:tiktok\.com\/.*\/video\/|vm\.tiktok\.com\/|t\.tiktok\.com\/)([\w]+)/);
        const videoId = youtubeMatch || tiktokMatch;
        let youtubeUrl = promotion.target_url;
        
        if (videoId) {
          // Ensure URL is in standard format for YouTube videos only
          if (youtubeMatch) {
            youtubeUrl = `https://www.youtube.com/watch?v=${youtubeMatch[1]}`;
          }

          // Fetch video information from YouTube API (only for YouTube videos)
          try {
            if (!youtubeMatch) {
              throw new Error('Video info not available for TikTok videos');
            }
            const videoInfo = await getYouTubeVideoInfo(youtubeMatch[1]);
            
            // Convert ISO duration to seconds
            const videoDurationSecs = getVideoDurationInSeconds(videoInfo.duration_seconds);
            
            // Insert into youtube_tasks with complete video info
            const videoResult = await client.query(`
              INSERT INTO youtube_tasks 
                (youtube_url, title, thumbnail, video_duration, expires_at, disabled, promotion_id)
              VALUES ($1, $2, $3, $4, $5, $6, $7)
              RETURNING *
            `, [
              youtubeUrl,
              videoInfo.title || promotion.title, // Use video title from API if available
              videoInfo.thumbnail,
              videoDurationSecs,
              promotion.expires_at,
              false, // disabled
              promotion.id
            ]);

            const youtubeTask = videoResult.rows[0];

            // If validation questions are provided, add them to youtube_questions
            if (promotion.validation_questions && Array.isArray(promotion.validation_questions) && promotion.validation_questions.length > 0) {
              for (const q of promotion.validation_questions) {
                if (q.question && q.correct_answer) {
                  const wrongAnswersArray = Array.isArray(q.wrong_answers) ? q.wrong_answers : 
                                           (q.wrong_answers ? [q.wrong_answers] : []);
                  
                  await client.query(
                    'INSERT INTO youtube_questions (youtube_task_id, question, correct_answer, wrong_answers) VALUES ($1, $2, $3, $4)',
                    [youtubeTask.id, q.question, q.correct_answer, wrongAnswersArray]
                  );
                }
              }
            }

            console.log('Created YouTube task with video info:', youtubeTask);
          } catch (videoError) {
            console.error('Error fetching YouTube video info:', videoError);
            // Fall back to basic task creation without video info
            const videoResult = await client.query(`
              INSERT INTO youtube_tasks 
                (youtube_url, title, expires_at, disabled, promotion_id)
              VALUES ($1, $2, $3, $4, $5)
              RETURNING *
            `, [
              youtubeUrl,
              promotion.title,
              promotion.expires_at,
              false, // disabled
              promotion.id
            ]);

            const youtubeTask = videoResult.rows[0];

            // If validation questions are provided, add them to youtube_questions
            if (promotion.validation_questions && Array.isArray(promotion.validation_questions) && promotion.validation_questions.length > 0) {
              for (const q of promotion.validation_questions) {
                if (q.question && q.correct_answer) {
                  const wrongAnswersArray = Array.isArray(q.wrong_answers) ? q.wrong_answers : 
                                           (q.wrong_answers ? [q.wrong_answers] : []);
                  
                  await client.query(
                    'INSERT INTO youtube_questions (youtube_task_id, question, correct_answer, wrong_answers) VALUES ($1, $2, $3, $4)',
                    [youtubeTask.id, q.question, q.correct_answer, wrongAnswersArray]
                  );
                }
              }
            }
          }
        }
      }
      
      await client.query('COMMIT');
      
      // Send notification to user
      const notificationMessage = `
✅ <b>Promotion Approved!</b>

Your promotion "<b>${promotion.title}</b>" has been approved by our admin team.

<b>Promotion Details:</b>
• Type: ${promotion.type === 'channel_join' ? 'Channel Join' : 'Video Boost'}
• Target: ${promotion.target_views_joins} engagements
• Budget: ${promotion.budget_points ? `${promotion.budget_points} points` : `$${promotion.budget_cash}`}
• Expires: ${new Date(promotion.expires_at).toLocaleDateString()}

${admin_notes ? `<b>Admin Notes:</b>\n${admin_notes}\n\n` : ''}
Your promotion is now ready to be activated. You can activate it from your promotion dashboard to start receiving engagements.

Thank you for using our platform!
      `.trim();
      
      await sendBotNotification(promotion.user_id, notificationMessage);
      
      res.json({ message: 'Promotion approved successfully', promotion: promotion });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error approving promotion:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/user-promotions/:id/decline', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_notes } = req.body;
    
    // Use transaction to ensure consistent updates
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the promotion and check status
      const promotionResult = await client.query(`
        SELECT * FROM user_submitted_promotions 
        WHERE id = $1 AND status = 'pending'
      `, [id]);
      
      if (promotionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Promotion not found or already processed' });
      }
      
      const promotion = promotionResult.rows[0];
      
      // Update promotion status
      const result = await client.query(`
        UPDATE user_submitted_promotions 
        SET status = 'declined', admin_notes = $1, declined_at = NOW(), updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `, [admin_notes || null, id]);
      
      // Refund points if this was a points-based promotion
      if (promotion.budget_points) {
        // Call the refund function
        await client.query(`SELECT refund_promotion_points($1)`, [id]);
        
        // Send notification to user
        const notificationMessage = `
❌ <b>Promotion Declined</b>

Your promotion "<b>${promotion.title}</b>" has been declined by our admin team.

${admin_notes ? `<b>Admin Notes:</b>\n${admin_notes}\n\n` : ''}
Your ${promotion.budget_points} points have been refunded to your account.

Thank you for using our platform!
        `.trim();
        
        await sendBotNotification(promotion.user_id, notificationMessage);
      }
      
      await client.query('COMMIT');
      res.json({ message: 'Promotion declined successfully', promotion: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error declining promotion:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/user-promotions/:id/activate', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Use transaction for consistent updates
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get promotion details
      const promotionResult = await client.query(`
        SELECT usp.*, tu.points
        FROM user_submitted_promotions usp
        JOIN telegram_users tu ON tu.id = usp.user_id
        WHERE usp.id = $1 AND usp.status = 'approved'
      `, [id]);
      
      if (promotionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Promotion not found or not approved' });
      }
      
      const promotion = promotionResult.rows[0];
      
      // For points-based promotions, check user has enough points
      if (promotion.budget_points) {
        if (promotion.points < promotion.budget_points) {
          await client.query('ROLLBACK');
          return res.status(400).json({ 
            message: 'User does not have enough points to activate this promotion'
          });
        }
        
        // Calculate total required points based on target and cost
        const totalRequiredPoints = promotion.target_views_joins * promotion.cost_per_action;
        
        // Set the points aside in user's locked_points
        await client.query(`
          UPDATE telegram_users
          SET points = points - $1, 
              locked_points = COALESCE(locked_points, 0) + $1
          WHERE id = $2
        `, [totalRequiredPoints, promotion.user_id]);
        
        // Update promotion stats to track held balance
        await client.query(`
          UPDATE user_submitted_promotions
          SET promotion_stats = jsonb_set(
            COALESCE(promotion_stats, '{}'::jsonb),
            '{held_balance}',
            $1::text::jsonb
          )
          WHERE id = $2
        `, [totalRequiredPoints.toString(), id]);
      }
      
      // Update promotion status
      const result = await client.query(`
        UPDATE user_submitted_promotions 
        SET status = 'active', activated_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);
      
      // Send notification to user
      const notificationMessage = `
🚀 <b>Promotion Activated!</b>

Your promotion "<b>${promotion.title}</b>" is now active and will be shown to users.

<b>Promotion Details:</b>
• Type: ${promotion.type === 'channel_join' ? 'Channel Join' : 'Video Boost'}
• Target: ${promotion.target_views_joins} engagements
• Budget: ${promotion.budget_points ? `${promotion.budget_points} points` : `$${promotion.budget_cash}`}
• Expires: ${new Date(promotion.expires_at).toLocaleDateString()}

You can track your promotion's performance in your dashboard.

Thank you for using our platform!
      `.trim();
      
      await sendBotNotification(promotion.user_id, notificationMessage);
      
      await client.query('COMMIT');
      res.json({ message: 'Promotion activated successfully', promotion: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error activating promotion:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/user-promotions/:id/deactivate', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { refund_remaining } = req.body;
    
    // Use transaction to ensure consistent updates
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the promotion and check status
      const promotionResult = await client.query(`
        SELECT usp.*, tu.locked_points,
               (promotion_stats->>'held_balance')::int as held_balance
        FROM user_submitted_promotions usp
        JOIN telegram_users tu ON tu.id = usp.user_id
        WHERE usp.id = $1 AND usp.status = 'active'
      `, [id]);
      
      if (promotionResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Promotion not found or not active' });
      }
      
      const promotion = promotionResult.rows[0];
      
      // Update promotion status
      const result = await client.query(`
        UPDATE user_submitted_promotions 
        SET status = 'completed', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [id]);
      
      // Refund remaining points if requested and this was a points-based promotion
      if (refund_remaining && promotion.budget_points && promotion.held_balance > 0) {
        // Return locked points to user
        await client.query(`
          UPDATE telegram_users
          SET points = points + $1, 
              locked_points = GREATEST(0, locked_points - $1)
          WHERE id = $2
        `, [promotion.held_balance, promotion.user_id]);
        
        // Reset held balance
        await client.query(`
          UPDATE user_submitted_promotions
          SET promotion_stats = jsonb_set(
            promotion_stats,
            '{held_balance}',
            '0'::jsonb
          )
          WHERE id = $1
        `, [id]);
        
        // Send notification to user
        const notificationMessage = `
✅ <b>Promotion Completed</b>

Your promotion "<b>${promotion.title}</b>" has been manually completed by our admin team.

${promotion.held_balance} points have been refunded to your account.

Thank you for using our platform!
        `.trim();
        
        await sendBotNotification(promotion.user_id, notificationMessage);
      }
      
      await client.query('COMMIT');
      res.json({ message: 'Promotion deactivated successfully', promotion: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error deactivating promotion:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Dashboard stats endpoint
router.get('/dashboard-stats', adminAuth, require('./dashboard-stats'));

module.exports = router;