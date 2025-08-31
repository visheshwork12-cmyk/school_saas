// src/shared/utils/core/logger.js - CORRECTED VERSION
import winston from 'winston';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

/**
 * @typedef {Object} LoggerConfig
 * @property {string} env - Environment name (e.g., 'production', 'development')
 * @property {string} logLevel - Logging level (e.g., 'info', 'debug')
 */

/**
 * Initializes Winston logger with environment-based transports.
 * Supports console logging for all environments and file logging for production.
 * @param {LoggerConfig} [config] - Optional configuration object
 * @returns {winston.Logger} Configured Winston logger
 */
const createLogger = (config = { 
  env: process.env.NODE_ENV || 'development',  // ✅ FIXED: Default to 'development'
  logLevel: process.env.LOG_LEVEL || 'info' 
}) => {
  
  // Ensure logs directory exists (only for non-serverless environments)
  const isServerless = Boolean(
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME
  );

  let logsDir;
  if (!isServerless) {
    logsDir = join(process.cwd(), 'logs');
    if (!existsSync(logsDir)) {
      try {
        mkdirSync(logsDir, { recursive: true });
      } catch (error) {
        console.warn('Could not create logs directory:', error.message);
      }
    }
  }

  // Base transports
  const transports = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}]: ${message} ${metaString}`;
        })
      ),
    }),
  ];

  // File transports only for non-serverless and production environments
  if (!isServerless && config.env === 'production' && logsDir) {
    try {
      transports.push(
        new winston.transports.File({
          filename: join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        }),
        new winston.transports.File({
          filename: join(logsDir, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      );
    } catch (error) {
      console.warn('Could not add file transports:', error.message);
    }
  }

  // Create logger instance with enhanced configuration
  const logger = winston.createLogger({
    level: config.logLevel || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: {
      service: 'school-erp-saas',
      environment: config.env,
      pid: process.pid,
      platform: process.platform
    },
    transports,
    // Enhanced exception/rejection handling
    exceptionHandlers: !isServerless && logsDir ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      new winston.transports.File({ 
        filename: join(logsDir, 'exceptions.log'),
        maxsize: 5242880,
        maxFiles: 3
      })
    ] : [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ],
    rejectionHandlers: !isServerless && logsDir ? [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      new winston.transports.File({ 
        filename: join(logsDir, 'rejections.log'),
        maxsize: 5242880,
        maxFiles: 3
      })
    ] : [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ],
  });

  // Enhanced audit logging method
  logger.audit = (event) => {
    logger.info('🔍 Audit Log', {
      ...event,
      timestamp: new Date().toISOString(),
      auditType: 'SYSTEM_AUDIT'
    });
  };

  // Performance logging method
  logger.performance = (operation, duration, meta = {}) => {
    logger.info('⚡ Performance Log', {
      operation,
      duration: `${duration}ms`,
      ...meta,
      timestamp: new Date().toISOString(),
      logType: 'PERFORMANCE'
    });
  };

  // Security logging method
  logger.security = (event, meta = {}) => {
    logger.warn('🔒 Security Log', {
      securityEvent: event,
      ...meta,
      timestamp: new Date().toISOString(),
      logType: 'SECURITY'
    });
  };

  return logger;
};

// Initialize logger with environment detection
const loggerConfig = {
  env: process.env.NODE_ENV || 'development',  // ✅ FIXED: Default to 'development'
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')
};

const logger = createLogger(loggerConfig);

// Log initial configuration
logger.info('📝 Logger initialized', {
  environment: loggerConfig.env,
  logLevel: loggerConfig.logLevel,
  isServerless: Boolean(
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME
  )
});

// Export for use in other modules
export { logger, createLogger };
