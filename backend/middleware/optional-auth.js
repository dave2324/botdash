// Optional auth middleware - allows requests without auth but sets user data if available
const optimizedAuth = require('./optimized-auth');

// Create middleware using the bot token from environment
const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('BOT_TOKEN or TELEGRAM_BOT_TOKEN environment variable is required');
}

// Create a modified version of the auth middleware that doesn't require authentication
const optionalAuth = (req, res, next) => {
  const initData = req.headers['x-telegram-init-data'];
  const hash = req.headers['x-telegram-hash'] || 
              (initData && initData.includes('hash=') ? 
                new URLSearchParams(initData).get('hash') : null);
  
  // If no auth data is provided, just continue without setting user data
  if (!initData || !hash || !token) {
    req.telegramUser = null;
    req.userData = null;
    return next();
  }
  
  // If auth data is provided, validate it using the regular auth middleware
  const regularAuth = optimizedAuth.validateTelegramWebAppData(token);
  regularAuth(req, res, (err) => {
    if (err) {
      // If auth fails, continue without user data instead of returning error
      req.telegramUser = null;
      req.userData = null;
    }
    next();
  });
};

module.exports = optionalAuth;