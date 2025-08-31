import winston from "winston";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

/**
 * @typedef {Object} LoggerConfig
 * @property {string} env - Environment name (e.g., 'production', 'development')
 * @property {string} logLevel - Logging level (e.g., 'info', 'debug')
 */

/**
 * Creates a temporary logger for initialization errors.
 * @returns {winston.Logger} Temporary Winston logger
 */
const createTempLogger = () => {
  return winston.createLogger({
    level: "warn",
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
      process.env.FUNCTION_NAME,
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

  const logsDir = join(process.cwd(), "logs");
  if (!existsSync(logsDir)) {
    try {
      mkdirSync(logsDir, { recursive: true });
    } catch (error) {
      tempLogger.warn("Could not create logs directory:", { message: error.message });
      return undefined;
    }
  }
  return logsDir;
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
      winston.format.printf(({ level, message, timestamp, ...meta }) => {
        const metaString = Object.keys(meta).length
          ? JSON.stringify(meta, null, 2)
          : "";
        return `${timestamp} [${level}]: ${message} ${metaString}`;
      }),
    ),
  });
};

/**
 * Configures file transports for production and non-serverless environments.
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
        filename: join(logsDir, "error.log"),
        level: "error",
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
      new winston.transports.File({
        filename: join(logsDir, "combined.log"),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json(),
        ),
      }),
    ];
  } catch (error) {
    tempLogger.warn("Could not add file transports:", { message: error.message });
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
        filename: join(logsDir, "exceptions.log"),
        maxsize: 5242880,
        maxFiles: 3,
      }),
    ],
    rejectionHandlers: [
      consoleHandler,
      new winston.transports.File({
        filename: join(logsDir, "rejections.log"),
        maxsize: 5242880,
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
    logger.info("🔍 Audit Log", {
      ...event,
      timestamp: new Date().toISOString(),
      auditType: "SYSTEM_AUDIT",
    });
  };

  logger.performance = (operation, duration, meta = {}) => {
    logger.info("⚡ Performance Log", {
      operation,
      duration: `${duration}ms`,
      ...meta,
      timestamp: new Date().toISOString(),
      logType: "PERFORMANCE",
    });
  };

  logger.security = (event, meta = {}) => {
    logger.warn("🔒 Security Log", {
      securityEvent: event,
      ...meta,
      timestamp: new Date().toISOString(),
      logType: "SECURITY",
    });
  };
};

/**
 * Initializes Winston logger with environment-based transports.
 * Supports console logging for all environments and file logging for production.
 * @param {LoggerConfig} [config] - Optional configuration object
 * @returns {winston.Logger} Configured Winston logger
 */
const createLogger = (
  config = {
    env: process.env.NODE_ENV || "development",
    logLevel: process.env.LOG_LEVEL || "info",
  },
) => {
  const logsDir = setupLogsDirectory();
  const transports = [getConsoleTransport(), ...getFileTransports(logsDir)];
  const { exceptionHandlers, rejectionHandlers } = getExceptionRejectionHandlers(logsDir);

  const logger = winston.createLogger({
    level: config.logLevel || "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: {
      service: "school-erp-saas",
      environment: config.env,
      pid: process.pid,
      platform: process.platform,
    },
    transports,
    exceptionHandlers,
    rejectionHandlers,
  });

  addCustomLoggingMethods(logger);
  return logger;
};

// Initialize logger with environment detection
const loggerConfig = {
  env: process.env.NODE_ENV || "development",
  logLevel:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
};

const logger = createLogger(loggerConfig);

// Log initial configuration
logger.info("📝 Logger initialized", {
  environment: loggerConfig.env,
  logLevel: loggerConfig.logLevel,
  isServerless: isServerlessEnvironment(),
});

// Export for use in other modules
export { logger, createLogger };