// Auth middleware wrapper
const optimizedAuth = require('./optimized-auth');
const { logger } = require('../config/logger');

// Telegram WebApp auth requires the bot token.
// IMPORTANT: do not crash the server during startup if it's missing.
//
// Provide BOT_TOKEN (or TELEGRAM_BOT_TOKEN) in production.
// For local/dev, you can bypass auth by setting DISABLE_TELEGRAM_AUTH=true.
const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const isAuthDisabled = String(process.env.DISABLE_TELEGRAM_AUTH).toLowerCase() === 'true';

module.exports = (req, res, next) => {
  if (isAuthDisabled) {
    req.telegramUser = null;
    req.userData = null;
    return next();
  }

  if (!token) {
    logger?.warn?.('Telegram auth not configured (missing BOT_TOKEN/TELEGRAM_BOT_TOKEN)', {
      path: req.originalUrl,
      method: req.method
    });

    return res.status(503).json({
      message: 'Telegram authentication is not configured on this server',
      hint: 'Set BOT_TOKEN (or TELEGRAM_BOT_TOKEN), or set DISABLE_TELEGRAM_AUTH=true for local development.'
    });
  }

  return optimizedAuth.validateTelegramWebAppData(token)(req, res, next);
};
