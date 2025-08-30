// src/shared/utils/core/logger.js
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
const createLogger = (config = { env: process.env.NODE_ENV || 'development', logLevel: 'info' }) => {
  // Ensure logs directory exists
  const logsDir = join(process.cwd(), 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  // Base transports
  const transports = [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ];

  // Production-specific file transports
  if (config.env === 'production') {
    transports.push(
      new winston.transports.File({
        filename: join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: join(logsDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      })
    );
  }

  // Create logger instance
  const logger = winston.createLogger({
    level: config.logLevel || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports,
    exceptionHandlers: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: join(logsDir, 'exceptions.log') }),
    ],
    rejectionHandlers: [
      new winston.transports.Console(),
      new winston.transports.File({ filename: join(logsDir, 'rejections.log') }),
    ],
  });

  // Audit logging for logger initialization
  logger.audit = (event) => {
    logger.info('Audit Log', {
      ...event,
      timestamp: new Date().toISOString(),
    });
  };

  return logger;
};

// Initialize logger with default config (avoiding config import)
const logger = createLogger();

// Export for use in other modules
export { logger, createLogger };