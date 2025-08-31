import baseConfig from "./base.config.js";
import { BusinessException } from "#exceptions/business.exception.js";

/**
 * @description Enhanced production environment configuration with security focus
 * @type {Object}
 */
const productionConfig = {
  ...baseConfig,
  env: "production",
  logLevel: process.env.LOG_LEVEL || "warn",

  // Production-optimized MongoDB
  mongo: {
    ...baseConfig.mongo,
    uri:
      process.env.MONGODB_URI ||
      throwError("MONGODB_URI required in production"),
    options: {
      ...baseConfig.mongo.options,
      // Production-optimized settings
      maxPoolSize: baseConfig.deployment.isServerless ? 1 : 50,
      minPoolSize: baseConfig.deployment.isServerless ? 0 : 5,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 30000,
      maxIdleTimeMS: baseConfig.deployment.isServerless ? 30000 : 300000,
      // Production-specific options
      autoIndex: false, // Don't build indexes automatically
      autoCreate: false, // Don't create collections automatically
      readPreference: "primaryPreferred",
      writeConcern: { w: "majority", j: true },
      readConcern: { level: "majority" },
    },
  },

  // Production Redis - required
  redis: {
    ...baseConfig.redis,
    enabled: true,
    host:
      process.env.REDIS_HOST || throwError("REDIS_HOST required in production"),
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password:
      process.env.REDIS_PASSWORD ||
      throwError("REDIS_PASSWORD required in production"),
    // Production-optimized settings
    connectTimeout: 10000,
    commandTimeout: 10000,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    enableOfflineQueue: !baseConfig.deployment.isServerless,
    // Connection pooling
    lazyConnect: false,
    keepAlive: true,
    family: 4,
  },

  // Strict CORS for production
  cors: {
    ...baseConfig.cors,
    allowedOrigins:
      process.env.CORS_ALLOWED_ORIGINS?.split(",") ||
      throwError("CORS_ALLOWED_ORIGINS required in production"),
    credentials: true,
    dynamicOrigin: false, // No dynamic origins in production
    optionsSuccessStatus: 200,
    maxAge: 86400,
  },

  // Strict rate limiting for production
  rateLimit: {
    ...baseConfig.rateLimit,
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    // Strict endpoint-specific limits
    endpoints: {
      "/api/v1/auth/login": {
        windowMs: 15 * 60 * 1000,
        max: 5,
      },
      "/api/v1/auth/register": {
        windowMs: 60 * 60 * 1000,
        max: 3,
      },
      "/api/v1/auth/forgot-password": {
        windowMs: 60 * 60 * 1000,
        max: 2,
      },
    },
  },

  // Production JWT - strict security
  jwt: {
    ...baseConfig.jwt,
    accessSecret:
      process.env.JWT_ACCESS_SECRET ||
      throwError("JWT_ACCESS_SECRET required in production"),
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ||
      throwError("JWT_REFRESH_SECRET required in production"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
    issuer: process.env.JWT_ISSUER || "school-erp-saas",
    audience: process.env.JWT_AUDIENCE || "school-erp-users",
    clockTolerance: 10, // Strict clock tolerance
  },

  // Production cache settings
  cache: {
    ...baseConfig.cache,
    ttl: 600, // 10 minutes
    checkperiod: 60,
    maxKeys: baseConfig.deployment.isServerless ? 1000 : 50000,
    strategy: baseConfig.redis.enabled ? "redis" : "memory",
  },

  // Production security - maximum security
  security: {
    ...baseConfig.security,
    https: {
      enabled: process.env.ENABLE_HTTPS !== "false",
      // keyPath: process.env.SSL_KEY_PATH,
      // certPath: process.env.SSL_CERT_PATH,
      // caPath: process.env.SSL_CA_PATH,
    },
    contentSecurityPolicy: {
      enabled: true,
      directives: {
        ...baseConfig.security.contentSecurityPolicy.directives,
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "https://fonts.googleapis.com"],
        imgSrc: [
          "'self'",
          "data:",
          process.env.AWS_S3_BUCKET
            ? `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com`
            : null,
        ].filter(Boolean),
      },
    },
    requireEmailVerification: true,
    enableDevBypass: false,
  },

  // Production logging - structured
  logging: {
    ...baseConfig.logging,
    level: process.env.LOG_LEVEL || "warn",
    structured: true,
    transports: {
      console: {
        enabled: true,
        colorize: false,
        json: true,
      },
      file: {
        enabled: !baseConfig.deployment.isServerless,
        filename: "production.log",
        dirname: "./logs",
        maxFiles: 10,
        maxSize: "100m",
      },
      cloudWatch: {
        enabled:
          baseConfig.deployment.platform === "aws-lambda" &&
          Boolean(process.env.CLOUDWATCH_LOG_GROUP),
        logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
        logStreamName: process.env.CLOUDWATCH_LOG_STREAM,
      },
    },
  },

  // Production features - security focused
  features: {
    enableDevMiddleware: false,
    enableDetailedErrors: false,
    enableRequestLogging: true,
    enableApiDocs: process.env.ENABLE_DOCS === "true",
    enableDebugMode: false,
    skipEmailVerification: false,
    enableMockData: false,
    enableTestEndpoints: false,
    enableHotReload: false,
    enableMetrics: true,
    enableHealthChecks: true,
    enableAuditLogging: true,
  },

  // Production authentication - strict
  auth: {
    ...baseConfig.auth,
    maxLoginAttempts: 5,
    accountLockoutDuration: "30m",
    sessionTimeout: "8h",
    maxConcurrentSessions: 2,
    enableDeviceTracking: true,
    enableIpValidation: true,
    enableSuspiciousActivityDetection: true,
    mfa: {
      enabled: process.env.MFA_ENABLED === "true",
      issuer: process.env.MFA_ISSUER || "School ERP SaaS",
      windowSize: 1,
    },
    passwordPolicy: {
      minLength: 12,
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSymbols: true,
      preventReuse: 10,
      maxAge: "90d",
    },
  },

  // Production monitoring - comprehensive
  monitoring: {
    ...baseConfig.monitoring,
    enabled: true,
    performance: {
      enabled: true,
      sampleRate: 0.1,
      slowQueryThreshold: 500,
    },
    errorTracking: {
      enabled: Boolean(process.env.SENTRY_DSN),
      dsn: process.env.SENTRY_DSN,
      environment: "production",
      release: process.env.APP_VERSION,
      tracesSampleRate: 0.1,
    },
  },

  // Production email - reliable service
  smtp: {
    ...baseConfig.smtp,
    host:
      process.env.SMTP_HOST || throwError("SMTP_HOST required in production"),
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user:
      process.env.SMTP_USER || throwError("SMTP_USER required in production"),
    pass:
      process.env.SMTP_PASS || throwError("SMTP_PASS required in production"),
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    queue: {
      enabled: true,
      concurrency: 5,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    },
  },

  // Production AWS configuration
  aws: {
    ...baseConfig.aws,
    accessKeyId:
      process.env.AWS_ACCESS_KEY_ID ||
      throwError("AWS_ACCESS_KEY_ID required in production"),
    secretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY ||
      throwError("AWS_SECRET_ACCESS_KEY required in production"),
    s3: {
      ...baseConfig.aws.s3,
      bucket:
        process.env.AWS_S3_BUCKET ||
        throwError("AWS_S3_BUCKET required in production"),
      signedUrlExpiresIn: 3600,
      maxFileSize: "50mb",
    },
    ses: {
      ...baseConfig.aws.ses,
      fromEmail:
        process.env.SES_FROM_EMAIL ||
        throwError("SES_FROM_EMAIL required in production"),
    },
    cloudWatch: {
      enabled: true,
      logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
      namespace: "SchoolERP/Production",
    },
  },
};

/**
 * @description Throws error for missing required variables in production
 * @param {string} variable - Variable name
 * @throws {BusinessException}
 */
function throwError(variable) {
  throw new BusinessException(
    `${variable} must be set in production environment`,
  );
}

export default productionConfig;
