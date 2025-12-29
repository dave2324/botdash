const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../logs');
const fs = require('fs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  verbose: 'grey',
  debug: 'blue',
  silly: 'rainbow'
};

winston.addColors(colors);

// Custom format for console logs
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}`
  )
);

// Custom format for file logs
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Transport for all logs (combined)
const allLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'combined-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '2d', // Keep logs for 2 days (48 hours)
  maxSize: '100m', // Max file size 100MB
  format: fileFormat,
  level: 'silly' // Log all levels
});

// Transport for error logs only
const errorLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '2d', // Keep logs for 2 days (48 hours)
  maxSize: '100m', // Max file size 100MB
  format: fileFormat,
  level: 'error' // Only error logs
});

// Transport for HTTP access logs
const httpLogsTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'access-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxFiles: '2d', // Keep logs for 2 days (48 hours)
  maxSize: '100m', // Max file size 100MB
  format: fileFormat,
  level: 'http'
});

// Create the logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  defaultMeta: { service: 'miniapp-backend' },
  transports: [
    allLogsTransport,
    errorLogsTransport,
    httpLogsTransport
  ],
  // Handle uncaught exceptions and unhandled rejections
  exceptionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '2d',
      maxSize: '100m',
      format: fileFormat
    })
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename: path.join(logsDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxFiles: '2d',
      maxSize: '100m',
      format: fileFormat
    })
  ]
});

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: 'debug'
  }));
}

// Event listeners for transport events
allLogsTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info(`Log rotated from ${oldFilename} to ${newFilename}`);
});

allLogsTransport.on('archive', (zipFilename) => {
  logger.info(`Log archived to ${zipFilename}`);
});

allLogsTransport.on('logRemoved', (removedFilename) => {
  logger.info(`Old log file removed: ${removedFilename}`);
});

// Helper functions for common log scenarios
const logHelper = {
  // Log API requests
  logRequest: (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      const message = `${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms - ${req.ip}`;
      
      if (res.statusCode >= 400) {
        logger.error(message, {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          body: req.body
        });
      } else {
        logger.http(message, {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          duration,
          ip: req.ip,
          userAgent: req.get('User-Agent')
        });
      }
    });
    
    next();
  },

  // Log database operations
  logDB: (operation, table, data = {}) => {
    logger.info(`DB: ${operation} on ${table}`, {
      operation,
      table,
      data,
      timestamp: new Date().toISOString()
    });
  },

  // Log authentication events
  logAuth: (event, userId = null, details = {}) => {
    logger.info(`AUTH: ${event}`, {
      event,
      userId,
      details,
      timestamp: new Date().toISOString()
    });
  },

  // Log bot events
  logBot: (event, details = {}) => {
    logger.info(`BOT: ${event}`, {
      event,
      details,
      timestamp: new Date().toISOString()
    });
  },

  // Log security events
  logSecurity: (event, details = {}) => {
    logger.warn(`SECURITY: ${event}`, {
      event,
      details,
      timestamp: new Date().toISOString()
    });
  },

  // Log performance metrics
  logPerformance: (operation, duration, details = {}) => {
    const level = duration > 1000 ? 'warn' : 'info';
    logger.log(level, `PERFORMANCE: ${operation} took ${duration}ms`, {
      operation,
      duration,
      details,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = { logger, logHelper };
