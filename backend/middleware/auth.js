// Auth middleware wrapper
const optimizedAuth = require('./optimized-auth');

// Create middleware using the bot token from environment
const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  throw new Error('BOT_TOKEN or TELEGRAM_BOT_TOKEN environment variable is required');
}

// Export the configured middleware
module.exports = optimizedAuth.validateTelegramWebAppData(token);