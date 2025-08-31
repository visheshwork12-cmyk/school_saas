// src/infrastructure/logging/winston.config.js - Comprehensive logging configuration
import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";
import DailyRotateFile from "winston-daily-rotate-file";
import appConfig from "#shared/config/app.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Winston Logger Configuration
 * Provides structured logging with multiple transports and formats
 */
class LoggerConfig {
  constructor() {
    this.logDir = path.join(process.cwd(), "logs");
    this.environment = appConfig.get("app.environment");
    this.logLevel = appConfig.get("logging.level");
    this.createLogDirectory();
  }

  createLogDirectory() {
    import("fs").then((fs) => {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
    });
  }

  /**
   * Custom log format with enhanced metadata
   */
  getLogFormat() {
    const {
      combine,
      timestamp,
      errors,
      json,
      colorize,
      printf,
      splat,
      metadata,
    } = winston.format;

    // Development format - human readable
    const developmentFormat = combine(
      colorize({ all: true }),
      timestamp({ format: "YYYY-MM-DD HH:mm:ss.SSS" }),
      errors({ stack: true }),
      splat(),
      printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level}] ${message}`;

        if (Object.keys(meta).length > 0) {
          log += `\n${JSON.stringify(meta, null, 2)}`;
        }

        if (stack) {
          log += `\n${stack}`;
        }

        return log;
      }),
    );

    // Production format - structured JSON
    const productionFormat = combine(
      timestamp(),
      errors({ stack: true }),
      metadata({ fillExcept: ["message", "level", "timestamp", "label"] }),
      json(),
    );

    return this.environment === "development"
      ? developmentFormat
      : productionFormat;
  }

  /**
   * Create file transport with rotation
   */
  createFileTransport(filename, level = "info", options = {}) {
    return new DailyRotateFile({
      filename: path.join(this.logDir, `${filename}-%DATE%.log`),
      datePattern: "YYYY-MM-DD",
      level,
      handleExceptions: level === "error",
      handleRejections: level === "error",
      maxSize: appConfig.get("logging.maxSize") || "50m",
      maxFiles: appConfig.get("logging.maxFiles") || "14d",
      compress: true,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      ...options,
    });
  }

  /**
   * Create console transport
   */
  createConsoleTransport() {
    return new winston.transports.Console({
      level: this.logLevel,
      handleExceptions: true,
      handleRejections: true,
      format: this.getLogFormat(),
    });
  }

  /**
   * Create HTTP transport for centralized logging
   */
  createHttpTransport() {
    const httpOptions = {
      level: "info",
      host: process.env.LOG_HTTP_HOST || "localhost",
      port: process.env.LOG_HTTP_PORT || 3001,
      path: process.env.LOG_HTTP_PATH || "/logs",
      // ssl: process.env.LOG_HTTP_SSL === 'true',
      format: winston.format.json(),
    };

    return new winston.transports.Http(httpOptions);
  }

  /**
   * Create Elasticsearch transport
   */
  createElasticsearchTransport() {
    // Note: Requires winston-elasticsearch package
    if (!process.env.ELASTICSEARCH_URL) {
      return null;
    }

    try {
      const { ElasticsearchTransport } = require("winston-elasticsearch");

      return new ElasticsearchTransport({
        level: "info",
        clientOpts: {
          node: process.env.ELASTICSEARCH_URL,
          auth: {
            username: process.env.ELASTICSEARCH_USER,
            password: process.env.ELASTICSEARCH_PASSWORD,
          },
        },
        index: `school-erp-logs-${this.environment}`,
        indexTemplate: {
          name: "school-erp-logs-template",
          patterns: [`school-erp-logs-${this.environment}-*`],
          settings: {
            numberOfShards: 1,
            numberOfReplicas: 1,
          },
        },
      });
    } catch (error) {
      console.warn("Elasticsearch transport not available:", error.message);
      return null;
    }
  }

  /**
   * Create Sentry transport for error tracking
   */
  createSentryTransport() {
    if (!process.env.SENTRY_DSN) {
      return null;
    }

    try {
      const { SentryTransport } = require("@sentry/node");

      return new SentryTransport({
        level: "error",
        dsn: process.env.SENTRY_DSN,
        environment: this.environment,
        tags: {
          component: "school-erp-api",
        },
      });
    } catch (error) {
      console.warn("Sentry transport not available:", error.message);
      return null;
    }
  }

  /**
   * Create main application logger
   */
  createLogger() {
    const transports = [];

    // Console transport (always enabled)
    transports.push(this.createConsoleTransport());

    // File transports
    if (appConfig.get("logging.enableFileLogging") !== false) {
      // Combined log file
      transports.push(this.createFileTransport("combined", "info"));

      // Error log file
      transports.push(this.createFileTransport("error", "error"));

      // Debug log file (development only)
      if (this.environment === "development") {
        transports.push(this.createFileTransport("debug", "debug"));
      }
    }

    // HTTP transport for centralized logging
    if (process.env.LOG_HTTP_ENABLED === "true") {
      transports.push(this.createHttpTransport());
    }

    // Elasticsearch transport
    const elasticsearchTransport = this.createElasticsearchTransport();
    if (elasticsearchTransport) {
      transports.push(elasticsearchTransport);
    }

    // Sentry transport for error tracking
    const sentryTransport = this.createSentryTransport();
    if (sentryTransport) {
      transports.push(sentryTransport);
    }

    const logger = winston.createLogger({
      level: this.logLevel,
      format: this.getLogFormat(),
      defaultMeta: {
        service: "school-erp-api",
        environment: this.environment,
        version: appConfig.get("app.version"),
        hostname: require("os").hostname(),
        pid: process.pid,
      },
      transports,
      exitOnError: false,
      silent: process.env.NODE_ENV === "test",
    });

    return logger;
  }

  /**
   * Create audit logger for security events
   */
  createAuditLogger() {
    return winston.createLogger({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      defaultMeta: {
        type: "audit",
        service: "school-erp-api",
        environment: this.environment,
      },
      transports: [
        this.createFileTransport("audit", "info", {
          filename: path.join(this.logDir, "audit-%DATE%.log"),
        }),
        new winston.transports.Console({
          level: "info",
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      ],
    });
  }

  /**
   * Create performance logger
   */
  createPerformanceLogger() {
    return winston.createLogger({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      defaultMeta: {
        type: "performance",
        service: "school-erp-api",
      },
      transports: [
        this.createFileTransport("performance", "info", {
          filename: path.join(this.logDir, "performance-%DATE%.log"),
        }),
      ],
    });
  }

  /**
   * Create request logger for HTTP requests
   */
  createRequestLogger() {
    return winston.createLogger({
      level: "info",
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      defaultMeta: {
        type: "request",
        service: "school-erp-api",
      },
      transports: [
        this.createFileTransport("requests", "info", {
          filename: path.join(this.logDir, "requests-%DATE%.log"),
        }),
      ],
    });
  }

  /**
   * Get all configured loggers
   */
  getAllLoggers() {
    return {
      main: this.createLogger(),
      audit: this.createAuditLogger(),
      performance: this.createPerformanceLogger(),
      request: this.createRequestLogger(),
    };
  }

  /**
   * Create logger middleware for Express
   */
  createExpressMiddleware() {
    const requestLogger = this.createRequestLogger();

    return (req, res, next) => {
      const startTime = Date.now();

      // Log request
      requestLogger.info("HTTP Request", {
        method: req.method,
        url: req.url,
        userAgent: req.get("User-Agent"),
        ip: req.ip,
        requestId: req.requestId,
        tenantId: req.context?.tenantId,
      });

      // Override res.end to log response
      const originalEnd = res.end;
      res.end = function (...args) {
        const duration = Date.now() - startTime;

        requestLogger.info("HTTP Response", {
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          requestId: req.requestId,
          tenantId: req.context?.tenantId,
        });

        originalEnd.apply(res, args);
      };

      next();
    };
  }
}

// Create logger configuration instance
const loggerConfig = new LoggerConfig();

// Export loggers
export const logger = loggerConfig.createLogger();
export const auditLogger = loggerConfig.createAuditLogger();
export const performanceLogger = loggerConfig.createPerformanceLogger();
export const requestLogger = loggerConfig.createRequestLogger();
export const loggerMiddleware = loggerConfig.createExpressMiddleware();

export default loggerConfig;
