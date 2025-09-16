import winston from 'winston';
import { CloudWatchLogsTransport } from 'winston-cloudwatch-logs';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import baseConfig from '#shared/config/environments/base.config.js';

/**
 * Creates a temporary logger for initialization errors.
 * @returns {winston.Logger} Temporary Winston logger
 */
const createTempLogger = () => {
  return winston.createLogger({
    level: 'warn',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.simple(),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
      }),
    ],
  });
};

/**
 * Checks if running in a serverless environment.
 * @returns {boolean} True if serverless
 */
const isServerlessEnvironment = () => 
  Boolean(
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME
  );

/**
 * Ensures logs directory exists for non-serverless environments.
 * @returns {string|undefined} Logs directory path or undefined if serverless
 */
const setupLogsDirectory = () => {
  const tempLogger = createTempLogger();
  if (isServerlessEnvironment()) {
    return undefined;
  }

  const logsDir = join(process.cwd(), 'logs');
  if (!existsSync(logsDir)) {
    try {
      mkdirSync(logsDir, { recursive: true });
    } catch (error) {
      tempLogger.warn('Could not create logs directory:', { message: error.message });
      return undefined;
    }
  }
  return logsDir;
};

/**
 * Creates CloudWatch transport for AWS environments.
 * @returns {CloudWatchLogsTransport|null} CloudWatch transport or null if not configured
 */
const createCloudWatchTransport = () => {
  if (!baseConfig.aws?.region || baseConfig.env === 'test') {
    return null;
  }

  return new CloudWatchLogsTransport({
    logGroupName: `/aws/school-erp/${baseConfig.env}/application`,
    logStreamName: `${baseConfig.env}-${process.env.HOSTNAME || 'localhost'}-${Date.now()}`,
    awsRegion: baseConfig.aws.region,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
    retentionInDays: baseConfig.env === 'production' ? 90 : 30,
    jsonMessage: true,
    uploadRate: 2000,
    errorHandler: (error) => {
      console.error('CloudWatch Logs error:', error);
    },
  });
};

/**
 * Configures console transport for all environments.
 * @returns {winston.transports.ConsoleTransport} Console transport
 */
const getConsoleTransport = () => {
  return new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        return `${timestamp} [${level}]: ${message} ${metaStr}`;
      })
    ),
  });
};

/**
 * Configures file transports for non-serverless environments.
 * @param {string} logsDir - Logs directory path
 * @returns {winston.Transport[]|[]} Array of file transports or empty array
 */
const getFileTransports = (logsDir) => {
  const tempLogger = createTempLogger();
  if (isServerlessEnvironment() || !logsDir) {
    return [];
  }

  try {
    return [
      new winston.transports.File({
        filename: join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
      new winston.transports.File({
        filename: join(logsDir, 'combined.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    ];
  } catch (error) {
    tempLogger.warn('Could not add file transports:', { message: error.message });
    return [];
  }
};

/**
 * Configures exception and rejection handlers.
 * @param {string|undefined} logsDir - Logs directory path
 * @returns {Object} Exception and rejection handlers
 */
const getExceptionRejectionHandlers = (logsDir) => {
  const consoleHandler = new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
    ),
  });

  if (isServerlessEnvironment() || !logsDir) {
    return {
      exceptionHandlers: [consoleHandler],
      rejectionHandlers: [consoleHandler],
    };
  }

  return {
    exceptionHandlers: [
      consoleHandler,
      new winston.transports.File({
        filename: join(logsDir, 'exceptions.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 3,
      }),
    ],
    rejectionHandlers: [
      consoleHandler,
      new winston.transports.File({
        filename: join(logsDir, 'rejections.log'),
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 3,
      }),
    ],
  };
};

/**
 * Adds custom logging methods (audit, performance, security) to the logger.
 * @param {winston.Logger} logger - Winston logger instance
 */
const addCustomLoggingMethods = (logger) => {
  logger.audit = (event) => {
    logger.info('🔍 Audit Log', {
      ...event,
      timestamp: new Date().toISOString(),
      auditType: 'SYSTEM_AUDIT',
    });
  };

  logger.performance = (operation, duration, meta = {}) => {
    logger.info('⚡ Performance Log', {
      operation,
      duration: `${duration}ms`,
      ...meta,
      timestamp: new Date().toISOString(),
      logType: 'PERFORMANCE',
    });
  };

  logger.security = (event, meta = {}) => {
    logger.warn('🔒 Security Log', {
      securityEvent: event,
      ...meta,
      timestamp: new Date().toISOString(),
      logType: 'SECURITY',
    });
  };
};

/**
 * Creates and configures Winston logger with environment-based transports.
 * @param {Object} [config] - Optional configuration object
 * @param {string} config.env - Environment name
 * @param {string} config.logLevel - Logging level
 * @returns {winston.Logger} Configured Winston logger
 */
const createLogger = (config = {
  env: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
}) => {
  const logsDir = setupLogsDirectory();
  const transports = [
    getConsoleTransport(),
    ...getFileTransports(logsDir),
  ];

  const cloudWatchTransport = createCloudWatchTransport();
  if (cloudWatchTransport) {
    transports.push(cloudWatchTransport);
  }

  const { exceptionHandlers, rejectionHandlers } = getExceptionRejectionHandlers(logsDir);

  const logger = winston.createLogger({
    level: config.logLevel || baseConfig.logging?.level || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: {
      service: 'school-erp-api',
      environment: config.env || baseConfig.env,
      version: baseConfig.version,
      pid: process.pid,
      platform: process.platform,
    },
    transports,
    exceptionHandlers,
    rejectionHandlers,
  });

  addCustomLoggingMethods(logger);

  // Log initial configuration
  logger.info('📝 Logger initialized', {
    environment: config.env || baseConfig.env,
    logLevel: config.logLevel || baseConfig.logging?.level,
    isServerless: isServerlessEnvironment(),
    cloudWatchEnabled: !!cloudWatchTransport,
  });

  return logger;
};

// Initialize logger
const loggerConfig = {
  env: process.env.NODE_ENV || baseConfig.env || 'development',
  logLevel: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
};

const logger = createLogger(loggerConfig);

export { logger, createLogger };
export default logger;