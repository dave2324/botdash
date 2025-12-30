// Optional auth middleware - allows requests without auth but sets user data if available
const optimizedAuth = require('./optimized-auth');

const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const isAuthDisabled = String(process.env.DISABLE_TELEGRAM_AUTH).toLowerCase() === 'true';

const optionalAuth = (req, res, next) => {
  if (isAuthDisabled) {
    req.telegramUser = null;
    req.userData = null;
    return next();
  }

  const initData = req.headers['x-telegram-init-data'];
  const hash =
    req.headers['x-telegram-hash'] ||
    (initData && initData.includes('hash=') ? new URLSearchParams(initData).get('hash') : null);

  // If no auth data is provided OR token isn't configured, just continue.
  if (!initData || !hash || !token) {
    req.telegramUser = null;
    req.userData = null;
    return next();
  }

  // If auth data is provided, validate it using the regular auth middleware.
  // If it fails, validateTelegramWebAppData will respond 401; we don't throw.
  return optimizedAuth.validateTelegramWebAppData(token)(req, res, next);
};

module.exports = optionalAuth;
