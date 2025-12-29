const crypto = require('crypto');
const pool = require('../config/database');
const { logger, logHelper } = require('../config/logger');

// In-memory cache for user data (Redis would be better for production)
const userCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const TOKEN_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_SIZE = 10000; // Prevent memory leaks

// Optimized LRU Cache implementation
class LRUCache {
  constructor(maxSize = 10000, ttl = CACHE_TTL) {
    this.maxSize = maxSize;
    this.ttl = ttl;
    this.cache = new Map();
  }

  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      
      // Check if expired first (before moving to end)
      if (Date.now() - value.timestamp > this.ttl) {
        this.cache.delete(key);
        return null;
      }
      
      // Move to end (most recently used) - this is the LRU behavior
      this.cache.delete(key);
      this.cache.set(key, value);
      
      return value.data;
    }
    return null;
  }

  set(key, data) {
    // If key already exists, update it (maintaining LRU order)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else {
      // Remove oldest entries if cache is full
      while (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  delete(key) {
    return this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  // Clean expired entries
  cleanExpired() {
    const now = Date.now();
    let removed = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.ttl) {
        this.cache.delete(key);
        removed++;
      }
    }
    
    return removed;
  }

  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      utilizationPercent: Math.round((this.cache.size / this.maxSize) * 100)
    };
  }
}

const authCache = new LRUCache(MAX_CACHE_SIZE, CACHE_TTL);

// Simplified token cache using LRU as well
const authTokenCache = new LRUCache(1000, TOKEN_CACHE_TTL); // Smaller cache for tokens

// Optimized Telegram auth middleware
const validateTelegramWebAppData = (token) => {
  return async (req, res, next) => {
    try {
      const initData = req.headers['x-telegram-init-data'];
      const hash = req.headers['x-telegram-hash'] || 
                  (initData && initData.includes('hash=') ? 
                    new URLSearchParams(initData).get('hash') : null);

      if (!initData || !hash || !token) {
        logHelper.logSecurity('Missing authentication data', {
          hasInitData: !!initData,
          hasHash: !!hash,
          hasToken: !!token,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ message: 'Missing authentication data' });
      }

      // Create cache key for this request
      const cacheKey = crypto.createHash('sha256').update(initData + hash).digest('hex');
      
      // Check if we've already validated this exact request recently
      const cachedAuth = authCache.get(cacheKey);
      if (cachedAuth) {
        req.telegramUser = cachedAuth.telegramUser;
        req.userData = cachedAuth.userData;
        return next();
      }

      // Clean initData by removing hash if present
      let cleanInitData = initData;
      if (initData.includes('hash=')) {
        cleanInitData = initData.replace(/&?hash=[^&]*(&|$)/, '$1').replace(/&$/, '');
      }

      // Parse and sort data pairs
      const params = new URLSearchParams(decodeURIComponent(cleanInitData));
      const dataPairs = Array.from(params.entries())
        .filter(([key]) => key !== 'hash')
        .sort(([a], [b]) => a.localeCompare(b));

      // Create data check string
      const dataCheckString = dataPairs
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      // Check token cache for secret key
      let secretKey = authTokenCache.get(token);
      if (!secretKey) {
        secretKey = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
        authTokenCache.set(token, secretKey);
      }

      // Calculate hash
      const calculatedHash = crypto
        .createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

      if (calculatedHash !== hash) {
        logHelper.logSecurity('Invalid authentication hash', {
          expectedHash: calculatedHash,
          receivedHash: hash,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
        return res.status(401).json({ message: 'Invalid authentication data' });
      }

      // Parse user data
      if (params.get('user')) {
        const user = JSON.parse(params.get('user'));
        
        const telegramUser = {
          id: user.id,
          username: user.username || '',
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          language_code: user.language_code || 'en',
          photo_url: user.photo_url || null,
        };

        // Check user cache first
        const userCacheKey = `user_${user.id}`;
        let userData = authCache.get(userCacheKey);
        
        if (!userData) {
          // Only hit database if not in cache
          logHelper.logAuth('Cache miss - fetching user from DB', user.id);
          
          const result = await pool.query(
            'INSERT INTO telegram_users (id, username, first_name, last_name, language_code, photo_url, last_active) ' +
            'VALUES ($1, $2, $3, $4, $5, $6, NOW()) ' +
            'ON CONFLICT (id) DO UPDATE SET ' +
            'username = EXCLUDED.username, ' +
            'first_name = EXCLUDED.first_name, ' +
            'last_name = EXCLUDED.last_name, ' +
            'language_code = EXCLUDED.language_code, ' +
            'photo_url = EXCLUDED.photo_url, ' +
            'last_active = NOW() ' +
            'RETURNING id, points, referral_code, is_banned, created_at',
            [user.id, user.username, user.first_name, user.last_name, user.language_code, user.photo_url]
          );
          
          userData = result.rows[0];
          
          // Cache user data
          authCache.set(userCacheKey, userData);
        } else {
          logHelper.logAuth('Cache hit - using cached user data', user.id);
        }

        // Cache the entire auth result
        authCache.set(cacheKey, {
          telegramUser,
          userData
        });
        
        req.telegramUser = telegramUser;
        req.userData = userData;
      }

      next();
    } catch (error) {
      logHelper.logSecurity('Authentication error', {
        error: error.message,
        stack: error.stack,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      logger.error('Error in authentication', {
        error: error.message,
        stack: error.stack,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      res.status(500).json({ message: 'Authentication error' });
    }
  };
};

// Cache invalidation functions
const invalidateUserCache = (userId) => {
  authCache.delete(`user_${userId}`);
  // Also clear any auth tokens for this user (more complex, but possible)
  logger.info('User cache invalidated', { userId });
};

// Cache statistics
const getCacheStats = () => {
  return {
    authCache: authCache.getStats(),
    tokenCache: authTokenCache.getStats(),
    memoryUsage: process.memoryUsage()
  };
};

// Clean up expired entries periodically
setInterval(() => {
  const authRemoved = authCache.cleanExpired();
  const tokenRemoved = authTokenCache.cleanExpired();
  
  if (authRemoved > 0 || tokenRemoved > 0) {
    logger.debug('Cache cleanup completed', {
      authEntriesRemoved: authRemoved,
      tokenEntriesRemoved: tokenRemoved,
      stats: getCacheStats()
    });
  }
}, 60000); // Clean every minute

module.exports = {
  validateTelegramWebAppData,
  invalidateUserCache,
  getCacheStats,
  authCache
};
