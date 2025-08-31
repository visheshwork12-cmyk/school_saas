// src/shared/config/environments/base.config.js - FIXED VERSION
import dotenv from 'dotenv';
import { logger } from '#utils/core/logger.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import os from 'os';

// Enhanced environment detection 
const detectDeploymentEnvironment = () => {
  const isServerless = Boolean(
    process.env.DEPLOYMENT_TYPE === 'serverless' ||
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.FUNCTION_NAME // Google Cloud Functions 
  );

  const platform = process.env.VERCEL ? 'vercel' :
    process.env.NETLIFY ? 'netlify' :
      process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' :
        process.env.FUNCTION_NAME ? 'gcp-functions' :
          process.env.RAILWAY ? 'railway' :
            process.env.RENDER ? 'render' :
              'traditional';

  return {
    isServerless,
    platform,
    environment: process.env.NODE_ENV || 'development',
    region: process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown'
  };
};

// Load environment variables with enhanced error handling 
const loadEnvironmentVariables = () => {
  const result = dotenv.config();
  if (result.error && process.env.NODE_ENV !== 'production') {
    logger.warn(`No .env file found: ${result.error.message}`);
  }
  return result;
};

// Initialize deployment info 
const deploymentInfo = detectDeploymentEnvironment();
loadEnvironmentVariables();

/** 
 * @description Enhanced base configuration with hybrid deployment support 
 * @type {Object} 
 */
const baseConfig = {
  // Enhanced Deployment Information 
  deployment: deploymentInfo,

  // Server Configuration 
  port: parseInt(process.env.PORT) || 3000,
  env: process.env.NODE_ENV || 'development',
  appName: process.env.APP_NAME || 'School ERP SaaS',
  version: process.env.APP_VERSION || '1.0.0',

  // Enhanced Database Configuration with platform-specific optimizations 
  mongo: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/school-erp-dev',
    options: {
      // Dynamic connection pooling based on deployment type 
      maxPoolSize: deploymentInfo.isServerless ? 1 :
        parseInt(process.env.MONGO_MAX_POOL_SIZE) || 10,
      minPoolSize: deploymentInfo.isServerless ? 0 :
        parseInt(process.env.MONGO_MIN_POOL_SIZE) || 2,
      serverSelectionTimeoutMS: deploymentInfo.isServerless ? 5000 :
        parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT) || 10000,
      socketTimeoutMS: deploymentInfo.isServerless ? 30000 :
        parseInt(process.env.MONGO_SOCKET_TIMEOUT) || 45000,
      connectTimeoutMS: deploymentInfo.isServerless ? 10000 : 30000,
      maxIdleTimeMS: deploymentInfo.isServerless ? 30000 : 300000,
      retryWrites: true,
      retryReads: true,
      readPreference: 'primaryPreferred',
      heartbeatFrequencyMS: deploymentInfo.isServerless ? 30000 : 10000,
    },
    // Multi-tenant database configuration 
    multiTenant: {
      enabled: process.env.MULTI_TENANT_ENABLED === 'true',
      strategy: process.env.TENANT_STRATEGY || 'database', // 'database' | 'schema' | 'collection' 
      defaultTenant: process.env.DEFAULT_TENANT || 'default',
    }
  },

  // Enhanced Redis Configuration 
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 0,
    // Serverless optimizations 
    connectTimeout: deploymentInfo.isServerless ? 5000 : 10000,
    commandTimeout: deploymentInfo.isServerless ? 5000 : 10000,
    retryDelayOnFailover: deploymentInfo.isServerless ? 50 : 100,
    maxRetriesPerRequest: deploymentInfo.isServerless ? 1 : 3,
    lazyConnect: true,
    enableOfflineQueue: !deploymentInfo.isServerless,
    // Connection pooling for traditional deployment 
    family: 4,
    keepAlive: !deploymentInfo.isServerless,
  },

  // Enhanced Cache Configuration 
  cache: {
    ttl: parseInt(process.env.CACHE_TTL) || 600,
    checkperiod: parseInt(process.env.CACHE_CHECK_PERIOD) || 60,
    maxKeys: deploymentInfo.isServerless ? 1000 : parseInt(process.env.CACHE_MAX_KEYS) || 10000,
    // Cache strategy 
    strategy: process.env.CACHE_STRATEGY || 'memory', // 'memory' | 'redis' | 'hybrid' 
    memoryLimit: deploymentInfo.isServerless ? '50mb' : '200mb',
  },

  // Platform-aware JWT Configuration 
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ||
      throwIfProduction('JWT_ACCESS_SECRET required'),
    refreshSecret: process.env.JWT_REFRESH_SECRET ||
      throwIfProduction('JWT_REFRESH_SECRET required'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    issuer: process.env.JWT_ISSUER || 'school-erp-saas',
    audience: process.env.JWT_AUDIENCE || 'school-erp-users',
    algorithm: process.env.JWT_ALGORITHM || 'HS256',
    // Enhanced security options 
    clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE) || 10,
    ignoreExpiration: false,
    ignoreNotBefore: false,
  },

  // Enhanced Security Configuration 
  security: {
    bcrypt: {
      saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
    },
    // HTTPS configuration 
    https: {
      enabled: process.env.ENABLE_HTTPS === 'true',
    },
    // Enhanced CSP 
    contentSecurityPolicy: {
      enabled: process.env.CSP_ENABLED !== 'false',
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : null].filter(Boolean),
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: ["'self'", 'data:', 'https:', process.env.AWS_S3_BUCKET ?
          `https://${process.env.AWS_S3_BUCKET}.s3.amazonaws.com` : '*'],
        connectSrc: ["'self'", process.env.REDIS_HOST ? `https://${process.env.REDIS_HOST}` : '*'],
        fontSrc: ["'self'", 'data:', "https://fonts.gstatic.com"],
      },
    },
  },

  // Enhanced Rate Limiting with platform awareness 
  rateLimit: {
    windowMs: deploymentInfo.isServerless ? 60000 :
      parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: deploymentInfo.isServerless ? 100 : parseInt(process.env.RATE_LIMIT_MAX) || 100,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: process.env.NODE_ENV === 'development',
    // Dynamic rate limiting based on user type 
    keyGenerator: (req) => {
      const userType = req.user?.role || 'anonymous';
      return `${req.ip}:${userType}`;
    },
    // Custom rate limits per endpoint 
    endpoints: {
      '/api/v1/auth/login': {
        windowMs: 15 * 60 * 1000,
        max: 5, // 5 login attempts per 15 minutes 
      },
      '/api/v1/auth/register': {
        windowMs: 60 * 60 * 1000,
        max: 3, // 3 registrations per hour 
      },
      '/api/v1/auth/forgot-password': {
        windowMs: 60 * 60 * 1000,
        max: 3, // 3 forgot password requests per hour 
      },
    },
  },

  // Enhanced Body Parser with platform-specific limits 
  bodyParser: {
    jsonLimit: deploymentInfo.isServerless ? '10mb' : process.env.BODY_PARSER_JSON_LIMIT || '1mb',
    urlencodedLimit: deploymentInfo.isServerless ? '10mb' :
      process.env.BODY_PARSER_URLENCODED_LIMIT || '1mb',
    parameterLimit: parseInt(process.env.BODY_PARSER_PARAMETER_LIMIT) || 1000,
    arrayLimit: parseInt(process.env.BODY_PARSER_ARRAY_LIMIT) || 100,
  },

  // Platform-aware Compression 
  compression: {
    enabled: process.env.COMPRESSION_ENABLED !== 'false',
    level: deploymentInfo.isServerless ? 1 : parseInt(process.env.COMPRESSION_LEVEL) || 6,
    threshold: parseInt(process.env.COMPRESSION_THRESHOLD) || 1024,
    chunkSize: parseInt(process.env.COMPRESSION_CHUNK_SIZE) || 16384,
  },

  // Enhanced Server Configuration 
  server: {
    timeout: deploymentInfo.isServerless ? 30000 : parseInt(process.env.SERVER_TIMEOUT) || 30000,
    keepAliveTimeout: deploymentInfo.isServerless ? 5000 :
      parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 65000,
    headersTimeout: deploymentInfo.isServerless ? 6000 :
      parseInt(process.env.HEADERS_TIMEOUT) || 66000,
    maxHeadersCount: parseInt(process.env.MAX_HEADERS_COUNT) || 2000,
    maxHeaderSize: parseInt(process.env.MAX_HEADER_SIZE) || 8192,
  },

  // Enhanced Logging Configuration 
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    maxFiles: deploymentInfo.isServerless ? 1 : parseInt(process.env.LOG_MAX_FILES) || 5,
    maxSize: deploymentInfo.isServerless ? '10m' : process.env.LOG_MAX_SIZE || '100m',
    // Structured logging 
    structured: process.env.STRUCTURED_LOGGING === 'true',
    // Platform-specific transports 
    transports: {
      console: {
        enabled: true,
        colorize: process.env.NODE_ENV === 'development',
      },
      file: {
        enabled: !deploymentInfo.isServerless,
        filename: process.env.LOG_FILE || 'app.log',
        dirname: process.env.LOG_DIR || './logs',
      },
      cloudWatch: {
        enabled: deploymentInfo.platform === 'aws-lambda' && process.env.CLOUDWATCH_LOG_GROUP,
        logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
        logStreamName: process.env.CLOUDWATCH_LOG_STREAM,
      },
    },
  },

  // CORS Configuration - FIXED (Array format) 
  cors: {
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['*'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // ✅ STRING FORMAT
    credentials: process.env.CORS_CREDENTIALS === 'true',
    optionsSuccessStatus: 200,
    maxAge: parseInt(process.env.CORS_MAX_AGE) || 86400,
    dynamicOrigin: process.env.CORS_DYNAMIC_ORIGIN === 'true',
    preflightContinue: false,
  },

  // Enhanced Multi-tenant Configuration 
  multiTenant: {
    enabled: process.env.MULTI_TENANT_ENABLED === 'true',
    mode: process.env.MULTI_TENANT_MODE || 'header', // 'header' | 'subdomain' | 'path' 
    defaultTenantId: process.env.DEFAULT_TENANT_ID || 'default',
    tenantHeaderName: process.env.TENANT_HEADER_NAME || 'x-tenant-id',
    isolationLevel: process.env.TENANT_ISOLATION_LEVEL || 'database', // 'database' | 'schema' | 'row' 
    cacheByTenant: process.env.CACHE_BY_TENANT === 'true',
    // Tenant resolution strategy 
    resolution: {
      strategy: process.env.TENANT_RESOLUTION_STRATEGY || 'header',
      headerName: process.env.TENANT_HEADER_NAME || 'x-tenant-id',
      subdomainIndex: parseInt(process.env.TENANT_SUBDOMAIN_INDEX) || 0,
      pathIndex: parseInt(process.env.TENANT_PATH_INDEX) || 1,
    },
  },

  // Enhanced Subscription Configuration 
  subscription: {
    defaultTrialDays: parseInt(process.env.DEFAULT_TRIAL_DAYS) || 30,
    gracePeriodDays: parseInt(process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS) || 7,
    trialFeatures: (process.env.TRIAL_FEATURES || 'ACADEMIC,ATTENDANCE').split(','),
    // Enhanced plan configurations 
    plans: {
      TRIAL: {
        duration: parseInt(process.env.TRIAL_DURATION_DAYS) || 30,
        features: (process.env.TRIAL_FEATURES || 'ACADEMIC,ATTENDANCE').split(','),
        limits: {
          students: parseInt(process.env.TRIAL_MAX_STUDENTS) || 25,
          teachers: parseInt(process.env.TRIAL_MAX_TEACHERS) || 3,
          storage: parseInt(process.env.TRIAL_MAX_STORAGE_GB) || 0.5,
          apiCalls: parseInt(process.env.TRIAL_MAX_API_CALLS) || 1000,
        },
      },
      BASIC: {
        features: (process.env.BASIC_FEATURES || 'ACADEMIC,ATTENDANCE,COMMUNICATION').split(','),
        limits: {
          students: parseInt(process.env.BASIC_MAX_STUDENTS) || 100,
          teachers: parseInt(process.env.BASIC_MAX_TEACHERS) || 10,
          storage: parseInt(process.env.BASIC_MAX_STORAGE_GB) || 2,
          apiCalls: parseInt(process.env.BASIC_MAX_API_CALLS) || 10000,
        },
      },
      PREMIUM: {
        features: (process.env.PREMIUM_FEATURES ||
          'ACADEMIC,ATTENDANCE,FINANCE,LIBRARY,HR,TRANSPORT').split(','),
        limits: {
          students: parseInt(process.env.PREMIUM_MAX_STUDENTS) || 500,
          teachers: parseInt(process.env.PREMIUM_MAX_TEACHERS) || 25,
          storage: parseInt(process.env.PREMIUM_MAX_STORAGE_GB) || 10,
          apiCalls: parseInt(process.env.PREMIUM_MAX_API_CALLS) || 50000,
        },
      },
      ENTERPRISE: {
        features: (process.env.ENTERPRISE_FEATURES || 'ALL').split(','),
        limits: {
          students: parseInt(process.env.ENTERPRISE_MAX_STUDENTS) || -1, // Unlimited 
          teachers: parseInt(process.env.ENTERPRISE_MAX_TEACHERS) || -1,
          storage: parseInt(process.env.ENTERPRISE_MAX_STORAGE_GB) || -1,
          apiCalls: parseInt(process.env.ENTERPRISE_MAX_API_CALLS) || -1,
        },
      },
    },
  },

  // Enhanced Auth Configuration 
  auth: {
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
    accountLockoutDuration: process.env.ACCOUNT_LOCKOUT_DURATION || '30m',
    sessionTimeout: process.env.SESSION_TIMEOUT || '24h',
    maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 3,
    enableDeviceTracking: process.env.ENABLE_DEVICE_TRACKING === 'true',
    enableIpValidation: process.env.ENABLE_IP_VALIDATION === 'true',
    enableSuspiciousActivityDetection: process.env.ENABLE_SUSPICIOUS_ACTIVITY_DETECTION === 'true',
    // Enhanced security features 
    mfa: {
      enabled: process.env.MFA_ENABLED === 'true',
      issuer: process.env.MFA_ISSUER || 'School ERP SaaS',
      windowSize: parseInt(process.env.MFA_WINDOW_SIZE) || 1,
    },
    passwordPolicy: {
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
      requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE === 'true',
      requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE === 'true',
      requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS === 'true',
      requireSymbols: process.env.PASSWORD_REQUIRE_SYMBOLS === 'true',
      preventReuse: parseInt(process.env.PASSWORD_PREVENT_REUSE) || 5,
      maxAge: process.env.PASSWORD_MAX_AGE || '90d',
    },
  },

  // Enhanced Versioning Configuration 
  versioning: {
    currentApiVersion: process.env.CURRENT_API_VERSION || '1.0.0',
    defaultVersion: process.env.DEFAULT_API_VERSION || '1.0.0',
    minimumSupportedVersion: process.env.MINIMUM_SUPPORTED_VERSION || '1.0.0',
    slowTransformationThresholdMs:
      parseInt(process.env.SLOW_TRANSFORMATION_THRESHOLD_MS) || 100,
    deprecationWarningDays: parseInt(process.env.VERSION_DEPRECATION_WARNING_DAYS) || 90,
    sunsetGracePeriodDays: parseInt(process.env.VERSION_SUNSET_GRACE_PERIOD_DAYS) || 180,
    // Version strategy 
    strategy: process.env.VERSIONING_STRATEGY || 'header', // 'header' | 'url' | 'query' 
    headerName: process.env.VERSION_HEADER_NAME || 'api-version',
    enableLegacySupport: process.env.ENABLE_LEGACY_SUPPORT === 'true',
  },

  // Enhanced Feature Flags Configuration 
  featureFlags: {
    provider: process.env.FEATURE_FLAGS_PROVIDER || 'memory', // 'memory' | 'redis' | 'database' | 'launchdarkly' 
    cacheTtl: parseInt(process.env.FEATURE_FLAGS_CACHE_TTL) || 300,
    defaultRolloutPercentage: parseInt(process.env.FEATURE_ROLLOUT_DEFAULT_PERCENTAGE) || 10,
    enableExperimentalFeatures: process.env.ENABLE_EXPERIMENTAL_FEATURES === 'true',
    abTestDurationDays: parseInt(process.env.A_B_TEST_DEFAULT_DURATION_DAYS) || 30,
    // Global feature flags 
    globalFlags: {
      maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
      readOnlyMode: process.env.READ_ONLY_MODE === 'true',
      newUserRegistration: process.env.NEW_USER_REGISTRATION !== 'false',
      emailVerificationRequired: process.env.EMAIL_VERIFICATION_REQUIRED === 'true',
    },
  },

  // Enhanced Cloud Configuration 
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    s3: {
      bucket: process.env.AWS_S3_BUCKET,
      region: process.env.AWS_S3_REGION || process.env.AWS_REGION || 'us-east-1',
      signedUrlExpiresIn: parseInt(process.env.S3_SIGNED_URL_EXPIRES_IN) || 3600,
      maxFileSize: process.env.S3_MAX_FILE_SIZE || '10mb',
      allowedFileTypes: (process.env.S3_ALLOWED_FILE_TYPES ||
        'image/*,application/pdf,text/*').split(','),
    },
    ses: {
      region: process.env.SES_REGION || process.env.AWS_REGION || 'us-east-1',
      fromEmail: process.env.SES_FROM_EMAIL,
      replyToEmail: process.env.SES_REPLY_TO_EMAIL,
    },
    cloudWatch: {
      enabled: process.env.CLOUDWATCH_ENABLED === 'true',
      logGroupName: process.env.CLOUDWATCH_LOG_GROUP,
      logStreamName: process.env.CLOUDWATCH_LOG_STREAM,
      namespace: process.env.CLOUDWATCH_NAMESPACE || 'SchoolERP',
    },
  },

  // Enhanced SMTP Configuration 
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    // Enhanced email configuration 
    templates: {
      path: process.env.EMAIL_TEMPLATES_PATH || './src/shared/templates/email',
      engine: process.env.EMAIL_TEMPLATE_ENGINE || 'handlebars',
    },
    queue: {
      enabled: process.env.EMAIL_QUEUE_ENABLED === 'true',
      concurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY) || 5,
      attempts: parseInt(process.env.EMAIL_QUEUE_ATTEMPTS) || 3,
      backoff: {
        type: process.env.EMAIL_QUEUE_BACKOFF_TYPE || 'exponential',
        delay: parseInt(process.env.EMAIL_QUEUE_BACKOFF_DELAY) || 2000,
      },
    },
  },

  // Enhanced Monitoring Configuration 
  monitoring: {
    enabled: process.env.MONITORING_ENABLED !== 'false',
    metricsPath: process.env.METRICS_PATH || '/metrics',
    healthCheckPath: process.env.HEALTH_CHECK_PATH || '/health',
    // Performance monitoring 
    performance: {
      enabled: process.env.PERFORMANCE_MONITORING_ENABLED === 'true',
      sampleRate: parseFloat(process.env.PERFORMANCE_SAMPLE_RATE) || 0.1,
      slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000,
    },
    // Error tracking 
    errorTracking: {
      enabled: process.env.ERROR_TRACKING_ENABLED === 'true',
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      release: process.env.APP_VERSION,
    },
  },

  // Deployment-specific optimizations 
  optimizations: {
    // Serverless optimizations 
    serverless: {
      coldStartOptimization: deploymentInfo.isServerless,
      connectionReuse: deploymentInfo.isServerless,
      minimalLogging: deploymentInfo.isServerless && process.env.NODE_ENV === 'production',
    },
    // Traditional deployment optimizations 
    traditional: {
      clustering: process.env.ENABLE_CLUSTERING === 'true',
      workers: parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length,
      gracefulShutdownTimeout: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT) || 30000,
    },
  },
};

/** 
 * @description Throws an error in production if a variable is missing 
 * @param {string} message - Error message 
 * @returns {string} Default value for development 
 * @throws {BusinessException} In production 
 */
function throwIfProduction(message) {
  if (process.env.NODE_ENV === 'production') {
    throw new BusinessException(message);
  }
  return 'dev-secret-key-minimum-32-characters-long';
}

// Enhanced production variable validation 
if (baseConfig.env === 'production') {
  const requiredVars = [
    'MONGODB_URI',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'CORS_ALLOWED_ORIGINS'
  ];

  // Platform-specific required variables 
  if (deploymentInfo.platform === 'aws-lambda') {
    requiredVars.push('AWS_REGION');
  }

  if (process.env.REDIS_ENABLED !== 'false') {
    requiredVars.push('REDIS_HOST');
  }

  if (process.env.EMAIL_ENABLED !== 'false') {
    requiredVars.push('SMTP_HOST', 'SMTP_USER', 'SMTP_PASS');
  }

  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      throwIfProduction(`${varName} is required in production environment`);
    }
  });
}

// Log deployment configuration 
logger.info('🔧 Base configuration loaded', {
  environment: baseConfig.env,
  deployment: deploymentInfo,
  mongoPoolSize: baseConfig.mongo.options.maxPoolSize,
  redisEnabled: baseConfig.redis.enabled,
  multiTenantEnabled: baseConfig.multiTenant.enabled,
});

export default baseConfig;
export { deploymentInfo };