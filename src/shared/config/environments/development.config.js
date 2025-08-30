import baseConfig from './base.config.js';

/**
 * @description Enhanced development environment configuration
 * @type {Object}
 */
const developmentConfig = {
  ...baseConfig,
  env: 'development',
  logLevel: 'debug',

  // Development-optimized MongoDB
  mongo: {
    ...baseConfig.mongo,
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/school-erp-dev',
    options: {
      ...baseConfig.mongo.options,
      maxPoolSize: 5, // Smaller pool for development
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      // Development-friendly options
      autoIndex: true, // Build indexes automatically
      autoCreate: true, // Create collections automatically
    },
  },

  // Development Redis - optional
  redis: {
    ...baseConfig.redis,
    enabled: process.env.REDIS_ENABLED === 'true', // Optional in development
    connectTimeout: 3000,
    lazyConnect: true,
  },

  // Development-friendly CORS
  cors: {
    ...baseConfig.cors,
    allowedOrigins: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173', // Vite
      'http://localhost:4200', // Angular
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:4200',
    ],
    credentials: true,
    dynamicOrigin: true, // Allow dynamic origins in development
  },

  // Lenient rate limiting for development
  rateLimit: {
    ...baseConfig.rateLimit,
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 1000, // Very lenient for development
    skipSuccessfulRequests: true,
    skipFailedRequests: true,
    // Disable endpoint-specific limits in development
    endpoints: {},
  },

  // Development JWT configuration
  jwt: {
    ...baseConfig.jwt,
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-key-minimum-32-chars-long-for-security',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-key-minimum-32-chars-long-for-security',
    accessExpiresIn: '24h', // Longer for development convenience
    refreshExpiresIn: '30d',
    clockTolerance: 60, // More tolerant in development
  },

  // Development cache - shorter TTL
  cache: {
    ...baseConfig.cache,
    ttl: 60, // 1 minute
    checkperiod: 30,
    maxKeys: 500,
    strategy: 'memory', // Memory cache for development
  },

  // Development-specific features
  features: {
    enableDevMiddleware: true,
    enableDetailedErrors: true,
    enableRequestLogging: true,
    enableApiDocs: true,
    enableDebugMode: true,
    skipEmailVerification: true,
    enableMockData: true,
    enableTestEndpoints: true,
    enableHotReload: true,
  },

  // Relaxed security for development
  security: {
    ...baseConfig.security,
    https: {
      enabled: false,
    },
    contentSecurityPolicy: {
      enabled: false, // Disable CSP in development
    },
    requireEmailVerification: false,
    enableDevBypass: true,
  },

  // Enhanced development logging
  logging: {
    ...baseConfig.logging,
    level: 'debug',
    structured: false, // Human-readable logs in development
    transports: {
      console: {
        enabled: true,
        colorize: true,
        prettyPrint: true,
      },
      file: {
        enabled: false, // Disable file logging in development
      },
    },
  },

  // Development subscription - free access
  subscription: {
    ...baseConfig.subscription,
    defaultTrialDays: 365, // Long trial for development
    plans: {
      ...baseConfig.subscription.plans,
      DEVELOPMENT: {
        features: ['ALL'],
        limits: {
          students: -1, // Unlimited
          teachers: -1,
          storage: -1,
          apiCalls: -1,
        },
      },
    },
  },

  // Development authentication - relaxed
  auth: {
    ...baseConfig.auth,
    maxLoginAttempts: 100, // Very lenient
    accountLockoutDuration: '1m',
    enableDeviceTracking: false,
    enableIpValidation: false,
    enableSuspiciousActivityDetection: false,
    passwordPolicy: {
      ...baseConfig.auth.passwordPolicy,
      minLength: 4, // Relaxed for development
      requireUppercase: false,
      requireLowercase: false,
      requireNumbers: false,
      requireSymbols: false,
    },
  },

  // Development feature flags - all enabled
  featureFlags: {
    ...baseConfig.featureFlags,
    enableExperimentalFeatures: true,
    globalFlags: {
      ...baseConfig.featureFlags.globalFlags,
      maintenanceMode: false,
      readOnlyMode: false,
      newUserRegistration: true,
      emailVerificationRequired: false,
    },
  },

  // Development monitoring - minimal
  monitoring: {
    ...baseConfig.monitoring,
    performance: {
      enabled: false, // Disable performance monitoring in development
    },
    errorTracking: {
      enabled: false, // Disable error tracking in development
    },
  },

  // Development-specific email configuration
  smtp: {
    ...baseConfig.smtp,
    // Use ethereal email for testing
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    user: process.env.SMTP_USER || 'ethereal.user@ethereal.email',
    pass: process.env.SMTP_PASS || 'ethereal.pass',
    queue: {
      enabled: false, // Process emails immediately in development
    },
  },
};

export default developmentConfig;
