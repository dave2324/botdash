require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const pool = require('./config/database');
const { createBot } = require('./bot');
const { logger, logHelper } = require('./config/logger');

// Initialize Express app
const app = express();

// Log application startup
logger.info('Starting Dashbot Backend Server', {
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || 'development',
  timestamp: new Date().toISOString()
});

// Optional: run database migrations on startup (use with care in production)
const { applyMigrations } = require('./migrations');

// Import admin routes
const adminRoutes = require('./admin/routes');
const promotionStatsRoutes = require('./admin/promotion-stats');

// Import optimized auth middleware
const { validateTelegramWebAppData, getCacheStats, invalidateUserCache } = require('./middleware/optimized-auth');

// Modern color theme based on Telegram's native palette
const appTheme = {
  primary: '#5288c1',      // Button color <mcreference link="https://docs.telegram-mini-apps.com/platform/theming" index="4">4</mcreference>
  secondary: '#232e3c',    // Secondary background
  background: '#17212b',   // Main background
  text: '#f5f5f5',         // Main text color
  accentText: '#6ab2f2',   // Accent text
  destructive: '#ec3942',  // Error/delete actions
  hint: '#708499',         // Subtle text
  link: '#6ab3f3',         // Links and actions
  sectionBg: '#17212b',    // Section backgrounds
  headerBg: '#17212b',     // Header background
};

// Database configuration - using shared pool
// (pool is now imported from ./config/database)

// Log database connection
pool.on('connect', (client) => {
  logger.info('Database connection established', {
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432
  });
});

pool.on('error', (err, client) => {
  logger.error('Database connection error', {
    error: err.message,
    stack: err.stack
  });
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    logger.error('Database connection test failed', {
      error: err.message,
      stack: err.stack
    });
  } else {
    logger.info('Database connection test successful', {
      serverTime: res.rows[0].now
    });
  }
});

// Generate a random referral code
const generateReferralCode = (length = 8) => {
  // Generate a random buffer
  const buffer = crypto.randomBytes(length);
  // Convert to a base64 string and remove non-alphanumeric characters
  return buffer.toString('base64')
    .replace(/[+/=]/g, '') // Remove non-alphanumeric characters
    .substring(0, length)  // Ensure consistent length
    .toUpperCase();        // Convert to uppercase for better readability
};

// Middleware
app.use(logHelper.logRequest); // Add request logging middleware

// Add timeout middleware
app.use((req, res, next) => {
  req.setTimeout(10000); // 10 second timeout
  res.setTimeout(10000);
  next();
});

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Telegram-Init-Data', 'X-Telegram-Hash', 'x-admin-token'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use(express.urlencoded({ extended: true, limit: '1mb' })); // Handle form data

// Initialize admin roles and superadmin account
const { initializeAdminRoles } = require('./admin/initialize');
initializeAdminRoles()
  .then(success => {
    if (success) {
      logger.info('Admin roles and superadmin account initialized successfully');
    } else {
      logger.warn('Admin roles initialization skipped or failed');
    }
  })
  .catch(error => {
    logger.error('Error initializing admin roles:', {
      error: error.message,
      stack: error.stack
    });
  });

// Use admin routes
app.use('/admin', adminRoutes);
app.use('/admin/promotion-stats', promotionStatsRoutes);
app.use('/admin/promotion-products', require('./admin/promotion-products'));
app.use('/admin/promotion-submissions', require('./admin/promotion-submissions'));
app.use('/admin/upload', require('./admin/upload'));
app.use('/admin/dashboard-stats', require('./admin/dashboard-stats'));
app.use('/admin/channel-verification', require('./admin/channel-verification'));
app.use('/admin/roles', require('./admin/admin-roles'));
app.use('/admin/staff', require('./admin/admin-users'));
// Removed conflicting route: app.use('/admin/users', require('./admin/users-routes'));
// This was overriding the miniapp users route in admin/routes.js

// Mount permissions endpoint directly under /admin for frontend compatibility
const adminRolesRouter = require('./admin/admin-roles');
app.use('/admin/permissions', (req, res, next) => {
  // Forward permissions requests to the roles router
  req.url = '/permissions' + req.url;
  adminRolesRouter(req, res, next);
});

// Cache stats endpoint for monitoring
app.get('/api/cache-stats', (req, res) => {
  res.json(getCacheStats());
});

// Cache invalidation endpoint (for admin use)
app.post('/api/invalidate-cache/:userId', (req, res) => {
  const userId = req.params.userId;
  if (userId) {
    invalidateUserCache(userId);
    res.json({ message: `Cache invalidated for user ${userId}` });
  } else {
    res.status(400).json({ message: 'User ID required' });
  }
});

// API Routes
app.get('/theme', (req, res) => {
  res.json(appTheme);
});

// Protected routes using Telegram authentication (skip payments which handle their own auth)
// NOTE: We use the wrapper middleware so missing BOT_TOKEN doesn't crash the server.
const telegramAuth = require('./middleware/auth');
app.use('/api', (req, res, next) => {
  return telegramAuth(req, res, next);
});

// Add this line to use the new referrals router
app.use('/api/user/referrals', require('./api/referrals'));

// Add telegram channels router
app.use('/api/telegram-channels', require('./api/telegram-channels'));

// Add video tasks router
app.use('/api/video-tasks', require('./api/video-tasks'));

// Add users router
app.use('/api/users', require('./api/users'));

// Add spin wheel router
app.use('/api/spin-wheel', require('./api/spin-wheel'));

// Add quiz router
app.use('/api/quizzes', require('./api/quizzes'));

// Add settings router
app.use('/api/settings', require('./api/settings'));

// Add promotion routes
app.use('/api/user-promotions', require('./api/user-promotions'));
app.use('/api/active-promotions', require('./api/active-promotions'));
app.use('/api/promotion-costs', require('./api/promotion-costs'));

// Add content creator promotion participation routes
app.use('/api/promotion-products', require('./api/promotion-products'));
app.use('/api/promotion-submissions', require('./api/promotion-submissions'));


// Add new feature routes
app.use('/api/affiliate-tasks', require('./api/affiliate-tasks'));
app.use('/api/upload', require('./api/upload'));
app.use('/api/courses', require('./api/courses'));
app.use('/api/checkins', require('./api/checkins'));
app.use('/api/ads', require('./api/ads'));
app.use('/api/leaderboard', require('./api/leaderboard'));

// User registration endpoint
app.post('/api/user/register', async (req, res) => {
  try {
    // User data is already validated and inserted by the middleware
    if (!req.telegramUser) {
      return res.status(400).json({ message: 'Invalid user data' });
    }

    // Fetch user points and other data
    const userDataResult = await pool.query(
      'SELECT id, username, first_name, last_name, points, referral_code, photo_url, created_at, is_banned, is_premium, premium_until, phone_number, email FROM telegram_users WHERE id = $1',
      [req.telegramUser.id]
    );
    
    const userData = userDataResult.rows[0];
    
    // If there's no referral code yet, generate one
    if (!userData.referral_code) {
      let referralCode;
      let isCodeUnique = false;
      
      // Keep generating codes until we find a unique one
      while (!isCodeUnique) {
        referralCode = generateReferralCode();
        
        // Check if the code already exists
        const existingCode = await pool.query(
          'SELECT COUNT(*) FROM telegram_users WHERE referral_code = $1',
          [referralCode]
        );
        
        if (parseInt(existingCode.rows[0].count) === 0) {
          isCodeUnique = true;
        }
      }
      
      await pool.query(
        'UPDATE telegram_users SET referral_code = $1 WHERE id = $2',
        [referralCode, req.telegramUser.id]
      );
      userData.referral_code = referralCode;
    }
    
    res.status(200).json({
      user: userData,
      message: 'User registered successfully'
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// User task summary endpoint - OPTIMIZED
app.get('/api/user/task-summary', async (req, res) => {
  try {
    const userId = req.telegramUser?.id;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Single optimized query to get all task data at once
    const result = await pool.query(
      `WITH 
        settings_data AS (
          SELECT 
            COALESCE(MAX(CASE WHEN key = 'max_spin_wheel_plays_per_day' THEN value::integer END), 5) as max_spins
          FROM settings
        ),
        user_spins AS (
          SELECT COALESCE(COUNT(*), 0) as daily_spins_used
          FROM spins 
          WHERE user_id = $1 AND created_at::date = CURRENT_DATE
        ),
        channels_data AS (
          SELECT 
            COUNT(*) as total_channels,
            COUNT(CASE WHEN COALESCE(tp.status, 'not_started') = 'completed' THEN 1 END) as completed_channels
          FROM telegram_channels c
          LEFT JOIN task_progress tp ON 
            tp.task_id = c.id AND 
            tp.task_type = 'channel_join' AND 
            tp.user_id = $1
          WHERE c.disabled = FALSE
        ),
        youtube_data AS (
          SELECT 
            COUNT(*) as total_youtube,
            COUNT(CASE WHEN COALESCE(tp.status, 'not_started') = 'completed' THEN 1 END) as completed_youtube
          FROM youtube_tasks yt
          LEFT JOIN task_progress tp ON 
            tp.task_id = yt.id AND 
            tp.task_type = 'youtube_video' AND 
            tp.user_id = $1
          WHERE yt.disabled = FALSE
            AND (yt.expires_at IS NULL OR yt.expires_at > NOW())
        ),
        quiz_data AS (
          SELECT 
            COUNT(*) as total_quizzes,
            COUNT(CASE WHEN qa.user_id IS NOT NULL THEN 1 END) as completed_quizzes
          FROM quizzes q
          LEFT JOIN user_quiz_attempts qa ON 
            qa.quiz_id = q.id AND 
            qa.user_id = $1 AND
            qa.completed_at IS NOT NULL
          WHERE q.is_active = TRUE
        )
      SELECT 
        s.max_spins,
        us.daily_spins_used,
        cd.total_channels,
        cd.completed_channels,
        yd.total_youtube,
        yd.completed_youtube,
        qd.total_quizzes,
        qd.completed_quizzes
      FROM settings_data s
      CROSS JOIN user_spins us
      CROSS JOIN channels_data cd
      CROSS JOIN youtube_data yd
      CROSS JOIN quiz_data qd`,
      [userId]
    );

    const data = result.rows[0];
    
    res.json({
      telegram_channels: {
        total: parseInt(data.total_channels),
        completed: parseInt(data.completed_channels),
        left: parseInt(data.total_channels) - parseInt(data.completed_channels)
      },
      youtube_tasks: {
        total: parseInt(data.total_youtube),
        completed: parseInt(data.completed_youtube),
        left: parseInt(data.total_youtube) - parseInt(data.completed_youtube)
      },
      spin_wheel: {
        max: parseInt(data.max_spins),
        used: parseInt(data.daily_spins_used),
        left: Math.max(0, parseInt(data.max_spins) - parseInt(data.daily_spins_used))
      },
      quizzes: {
        total: parseInt(data.total_quizzes),
        completed: parseInt(data.completed_quizzes),
        left: parseInt(data.total_quizzes) - parseInt(data.completed_quizzes)
      }
    });
  } catch (error) {
    console.error('Error in /api/user/task-summary:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  logHelper.logSecurity('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.telegramUser?.id,
    body: req.body
  });
  
  // Log the error
  logger.error('Unhandled application error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.telegramUser?.id
  });
  
  res.status(500).json({ message: 'Something went wrong!' });
});

// Start server and bot
const PORT = process.env.PORT || 3000;

(async () => {
  let bot = null;

  // Optionally apply SQL migrations before the app starts serving requests.
  // Recommended approach on Railway:
  // - Temporarily set RUN_MIGRATIONS=true
  // - Deploy once and watch logs until migrations complete
  // - Then set RUN_MIGRATIONS=false (or remove)
  if (String(process.env.RUN_MIGRATIONS).toLowerCase() === 'true') {
    logger.warn('RUN_MIGRATIONS=true: applying pending SQL migrations');
    await applyMigrations();
  }

  // Start the server first so deployments don't crash just because optional integrations
  // (like the Telegram bot token) are not configured.
  app.listen(PORT, () => {
    logger.info('Server started successfully', {
      port: PORT,
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    });
  });

  try {
    // createBot() now fully initializes and starts the bot (polling mode).
    // No need to call start() again here.
    bot = await createBot();

    logger.info('Telegram bot started successfully', {
      botToken: process.env.BOT_TOKEN ? '[REDACTED]' : 'NOT_SET',
      apiId: process.env.API_ID ? '[REDACTED]' : 'NOT_SET'
    });
  } catch (error) {
    // Do NOT crash the whole server if the bot cannot start.
    logger.error('Telegram bot failed to start (server will continue without bot)', {
      error: error.message,
      stack: error.stack
    });
  }

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    try {
      if (bot && typeof bot.stop === 'function') await bot.stop();
    } finally {
      process.exit(0);
    }
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received. Shutting down gracefully...');
    try {
      if (bot && typeof bot.stop === 'function') await bot.stop();
    } finally {
      process.exit(0);
    }
  });
})();