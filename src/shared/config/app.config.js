// src/shared/config/app.config.js - Application-wide configuration management
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '#utils/core/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Application Configuration Manager
 * Provides centralized configuration management with environment-specific overrides
 */
class ApplicationConfig {
  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.config = this.loadConfiguration();
    this.validateConfiguration();
  }

  loadConfiguration() {
    const baseConfig = {
      // Application Info
      app: {
        name: process.env.APP_NAME || 'School ERP SaaS',
        version: process.env.APP_VERSION || '1.0.0',
        description: 'Multi-tenant School Management System',
        environment: this.environment,
        port: parseInt(process.env.PORT) || 3000,
        host: process.env.HOST || 'localhost',
        timezone: process.env.TZ || 'Asia/Kolkata',
        locale: process.env.LOCALE || 'en-IN',
        url: process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
        apiVersion: process.env.API_VERSION || 'v1',
        startupTimeout: parseInt(process.env.STARTUP_TIMEOUT) || 30000
      },

      // Server Configuration
      server: {
        timeout: parseInt(process.env.SERVER_TIMEOUT) || 30000,
        keepAliveTimeout: parseInt(process.env.KEEP_ALIVE_TIMEOUT) || 65000,
        headersTimeout: parseInt(process.env.HEADERS_TIMEOUT) || 66000,
        maxHeadersCount: parseInt(process.env.MAX_HEADERS_COUNT) || 2000,
        trustProxy: process.env.TRUST_PROXY === 'true',
        gracefulShutdownTimeout: parseInt(process.env.GRACEFUL_SHUTDOWN_TIMEOUT) || 30000
      },

      // Database Configuration
      database: {
        mongodb: {
          uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/school-erp-dev',
          options: {
            maxPoolSize: parseInt(process.env.MONGO_MAX_POOL_SIZE) || 10,
            minPoolSize: parseInt(process.env.MONGO_MIN_POOL_SIZE) || 1,
            serverSelectionTimeoutMS: parseInt(process.env.MONGO_SERVER_SELECTION_TIMEOUT) || 10000,
            socketTimeoutMS: parseInt(process.env.MONGO_SOCKET_TIMEOUT) || 45000,
            connectTimeoutMS: parseInt(process.env.MONGO_CONNECT_TIMEOUT) || 10000,
            maxIdleTimeMS: parseInt(process.env.MONGO_MAX_IDLE_TIME) || 300000,
            retryWrites: process.env.MONGO_RETRY_WRITES !== 'false',
            retryReads: process.env.MONGO_RETRY_READS !== 'false'
          }
        }
      },

      // Cache Configuration
      cache: {
        redis: {
          enabled: process.env.REDIS_ENABLED !== 'false',
          url: process.env.REDIS_URL || 'redis://localhost:6379',
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB) || 0,
          keyPrefix: process.env.REDIS_KEY_PREFIX || 'school-erp:',
          ttl: parseInt(process.env.CACHE_TTL) || 600,
          maxKeys: parseInt(process.env.CACHE_MAX_KEYS) || 10000,
          checkPeriod: parseInt(process.env.CACHE_CHECK_PERIOD) || 60
        },
        memory: {
          enabled: true,
          maxSize: parseInt(process.env.MEMORY_CACHE_MAX_SIZE) || 100,
          ttl: parseInt(process.env.MEMORY_CACHE_TTL) || 300
        }
      },

      // Authentication & Security
      auth: {
        jwt: {
          accessSecret: process.env.JWT_ACCESS_SECRET || 'your-access-secret-key',
          refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
          accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
          refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
          issuer: process.env.JWT_ISSUER || 'school-erp-saas',
          audience: process.env.JWT_AUDIENCE || 'school-erp-users',
          algorithm: process.env.JWT_ALGORITHM || 'HS256',
          clockTolerance: parseInt(process.env.JWT_CLOCK_TOLERANCE) || 30
        },
        session: {
          secret: process.env.SESSION_SECRET || 'your-session-secret',
          timeout: process.env.SESSION_TIMEOUT || '24h',
          maxConcurrent: parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 3
        },
        password: {
          saltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12,
          minLength: parseInt(process.env.PASSWORD_MIN_LENGTH) || 8,
          maxLength: parseInt(process.env.PASSWORD_MAX_LENGTH) || 128,
          requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
          requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
          requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
          requireSymbols: process.env.PASSWORD_REQUIRE_SYMBOLS !== 'false'
        },
        security: {
          maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5,
          lockoutDuration: process.env.ACCOUNT_LOCKOUT_DURATION || '30m',
          enableDeviceTracking: process.env.ENABLE_DEVICE_TRACKING === 'true',
          enableIpValidation: process.env.ENABLE_IP_VALIDATION === 'true',
          enableSuspiciousActivityDetection: process.env.ENABLE_SUSPICIOUS_ACTIVITY_DETECTION === 'true'
        }
      },

      // Multi-tenant Configuration
      multiTenant: {
        enabled: process.env.MULTI_TENANT_ENABLED !== 'false',
        mode: process.env.MULTI_TENANT_MODE || 'header', // header, subdomain, path
        defaultTenantId: process.env.DEFAULT_TENANT_ID || 'default',
        tenantHeaderName: process.env.TENANT_HEADER_NAME || 'x-tenant-id',
        isolationLevel: process.env.TENANT_ISOLATION_LEVEL || 'database', // database, row, schema
        cacheByTenant: process.env.CACHE_BY_TENANT === 'true',
        maxTenantsPerUser: parseInt(process.env.MAX_TENANTS_PER_USER) || 5
      },

      // Subscription & Billing
      subscription: {
        defaultTrialDays: parseInt(process.env.DEFAULT_TRIAL_DAYS) || 30,
        gracePeriodDays: parseInt(process.env.SUBSCRIPTION_GRACE_PERIOD_DAYS) || 7,
        plans: {
          trial: {
            name: 'Trial',
            duration: parseInt(process.env.DEFAULT_TRIAL_DAYS) || 30,
            features: (process.env.TRIAL_FEATURES || 'ACADEMIC,ATTENDANCE').split(','),
            limits: {
              students: parseInt(process.env.TRIAL_MAX_STUDENTS) || 50,
              teachers: parseInt(process.env.TRIAL_MAX_TEACHERS) || 5,
              storage: parseInt(process.env.TRIAL_MAX_STORAGE_GB) || 1
            }
          },
          basic: {
            name: 'Basic',
            features: (process.env.BASIC_FEATURES || 'ACADEMIC,ATTENDANCE').split(','),
            limits: {
              students: parseInt(process.env.BASIC_MAX_STUDENTS) || 100,
              teachers: parseInt(process.env.BASIC_MAX_TEACHERS) || 10,
              storage: parseInt(process.env.BASIC_MAX_STORAGE_GB) || 2
            }
          },
          premium: {
            name: 'Premium',
            features: (process.env.PREMIUM_FEATURES || 'ACADEMIC,ATTENDANCE,FINANCE,LIBRARY').split(','),
            limits: {
              students: parseInt(process.env.PREMIUM_MAX_STUDENTS) || 500,
              teachers: parseInt(process.env.PREMIUM_MAX_TEACHERS) || 25,
              storage: parseInt(process.env.PREMIUM_MAX_STORAGE_GB) || 10
            }
          },
          enterprise: {
            name: 'Enterprise',
            features: ['ALL'],
            limits: {
              students: -1, // Unlimited
              teachers: -1,
              storage: -1
            }
          }
        }
      },

      // Rate Limiting
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
        max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
        skipSuccessfulRequests: process.env.RATE_LIMIT_SKIP_SUCCESSFUL === 'true',
        skipFailedRequests: process.env.RATE_LIMIT_SKIP_FAILED === 'true',
        keyGenerator: null, // Will be set dynamically
        handler: null // Will be set dynamically
      },

      // CORS Configuration - FINAL FIX
      // CORS Configuration - BULLETPROOF FIX
      // CORS Configuration - NUCLEAR FIX (100% Static)
      cors: {
        allowedOrigins: ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
        methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS', // PURE STRING
        credentials: true,
        maxAge: 86400
      },





      // File Upload & Storage
      storage: {
        provider: process.env.STORAGE_PROVIDER || 'local', // local, s3, gcs
        local: {
          uploadDir: process.env.UPLOAD_DIR || './uploads',
          maxFileSize: process.env.MAX_FILE_SIZE || '10mb',
          allowedTypes: this.parseArray(process.env.ALLOWED_FILE_TYPES) || ['image/*', 'application/pdf']
        },
        s3: {
          bucket: process.env.AWS_S3_BUCKET,
          region: process.env.AWS_REGION || 'us-east-1',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          signedUrlExpires: parseInt(process.env.S3_SIGNED_URL_EXPIRES) || 3600
        }
      },

      // Email Configuration
      email: {
        provider: process.env.EMAIL_PROVIDER || 'smtp', // smtp, ses, sendgrid
        smtp: {
          host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        },
        from: process.env.EMAIL_FROM || 'noreply@school-erp.com',
        replyTo: process.env.EMAIL_REPLY_TO,
        templates: {
          engine: process.env.EMAIL_TEMPLATE_ENGINE || 'handlebars',
          path: process.env.EMAIL_TEMPLATES_PATH || './src/shared/templates/email'
        },
        queue: {
          enabled: process.env.EMAIL_QUEUE_ENABLED === 'true',
          concurrency: parseInt(process.env.EMAIL_QUEUE_CONCURRENCY) || 3,
          attempts: parseInt(process.env.EMAIL_QUEUE_ATTEMPTS) || 3
        }
      },

      // Logging Configuration
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        format: process.env.LOG_FORMAT || 'json',
        structured: process.env.STRUCTURED_LOGGING === 'true',
        enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
        maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
        maxSize: process.env.LOG_MAX_SIZE || '50m',
        datePattern: process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD'
      },

      // Monitoring & Health
      monitoring: {
        enabled: process.env.MONITORING_ENABLED === 'true',
        metricsPath: process.env.METRICS_PATH || '/metrics',
        healthCheckPath: process.env.HEALTH_CHECK_PATH || '/health',
        healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
        performance: {
          enabled: process.env.PERFORMANCE_MONITORING_ENABLED === 'true',
          sampleRate: parseFloat(process.env.PERFORMANCE_SAMPLE_RATE) || 0.1,
          slowQueryThreshold: parseInt(process.env.SLOW_QUERY_THRESHOLD) || 1000
        },
        errorTracking: {
          enabled: process.env.ERROR_TRACKING_ENABLED === 'true',
          dsn: process.env.SENTRY_DSN,
          environment: process.env.SENTRY_ENVIRONMENT || this.environment,
          tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.1
        }
      },

      // Feature Flags
      features: {
        enableApiDocs: process.env.ENABLE_API_DOCS === 'true',
        enableMetrics: process.env.ENABLE_METRICS === 'true',
        enableDebugMode: process.env.ENABLE_DEBUG_MODE === 'true',
        enableExperimentalFeatures: process.env.ENABLE_EXPERIMENTAL_FEATURES === 'true',
        enableDetailedErrors: process.env.ENABLE_DETAILED_ERRORS === 'true',
        enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING === 'true',
        enablePerformanceMonitoring: process.env.ENABLE_PERFORMANCE_MONITORING === 'true',
        enableHealthChecks: process.env.ENABLE_HEALTH_CHECKS === 'true',
        enableAuditLogging: process.env.ENABLE_AUDIT_LOGGING === 'true'
      },

      // API Versioning
      versioning: {
        currentApiVersion: process.env.CURRENT_API_VERSION || '1.0.0',
        defaultVersion: process.env.DEFAULT_API_VERSION || '1.0.0',
        minimumSupportedVersion: process.env.MINIMUM_SUPPORTED_VERSION || '1.0.0',
        deprecationWarningDays: parseInt(process.env.VERSION_DEPRECATION_WARNING_DAYS) || 90,
        sunsetGracePeriodDays: parseInt(process.env.VERSION_SUNSET_GRACE_PERIOD_DAYS) || 180,
        enableLegacySupport: process.env.ENABLE_LEGACY_SUPPORT === 'true'
      },

      // Deployment Information
      deployment: {
        platform: this.detectPlatform(),
        buildId: process.env.BUILD_ID || process.env.VERCEL_GIT_COMMIT_SHA || 'development',
        region: process.env.REGION || process.env.VERCEL_REGION || process.env.AWS_REGION || 'unknown',
        isServerless: this.isServerlessEnvironment(),
        isContainer: this.isContainerEnvironment()
      }
    };

    // Environment-specific overrides
    return this.applyEnvironmentOverrides(baseConfig);
  }

  parseArray(value) {
    if (!value) {return null;}
    if (Array.isArray(value)) {return value;}
    return value.split(',').map(item => item.trim());
  }


  detectPlatform() {
    if (process.env.VERCEL) {return 'vercel';}
    if (process.env.NETLIFY) {return 'netlify';}
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {return 'aws-lambda';}
    if (process.env.KUBERNETES_SERVICE_HOST) {return 'kubernetes';}
    if (process.env.DOCKER_CONTAINER) {return 'docker';}
    return 'traditional';
  }

  isServerlessEnvironment() {
    return Boolean(
      process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.FUNCTION_NAME
    );
  }

  isContainerEnvironment() {
    return Boolean(
      process.env.KUBERNETES_SERVICE_HOST ||
      process.env.DOCKER_CONTAINER
    );
  }

  applyEnvironmentOverrides(baseConfig) {
    const overrides = {
      development: {
        app: {
          url: `http://localhost:${baseConfig.app.port}`
        },
        database: {
          mongodb: {
            options: {
              maxPoolSize: 5,
              serverSelectionTimeoutMS: 5000
            }
          }
        },
        auth: {
          jwt: {
            accessExpiresIn: '24h', // Longer for development
            refreshExpiresIn: '30d'
          }
        },
        rateLimit: {
          max: 1000, // More lenient for development
          windowMs: 60000
        },
        features: {
          enableApiDocs: true,
          enableDebugMode: true,
          enableDetailedErrors: true
        }
      },

      staging: {
        app: {
          url: process.env.STAGING_URL || baseConfig.app.url
        },
        database: {
          mongodb: {
            options: {
              maxPoolSize: 15
            }
          }
        },
        rateLimit: {
          max: 500,
          windowMs: 300000 // 5 minutes
        },
        features: {
          enableApiDocs: true,
          enableDetailedErrors: true
        }
      },

      production: {
        database: {
          mongodb: {
            options: {
              maxPoolSize: 25,
              readPreference: 'primaryPreferred'
            }
          }
        },
        rateLimit: {
          max: 100,
          windowMs: 900000 // 15 minutes
        },
        features: {
          enableApiDocs: false,
          enableDebugMode: false,
          enableDetailedErrors: false
        }
      }
    };

    const environmentOverride = overrides[this.environment] || {};
    return this.deepMerge(baseConfig, environmentOverride);
  }

  deepMerge(target, source) {
    const output = Object.assign({}, target);

    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = this.deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });

    return output;
  }

  validateConfiguration() {
    const requiredEnvVars = [
      'MONGODB_URI',
      'JWT_ACCESS_SECRET',
      'JWT_REFRESH_SECRET'
    ];

    const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

    if (missingVars.length > 0) {
      const message = `Missing required environment variables: ${missingVars.join(', ')}`;
      logger.error(message);

      if (this.environment === 'production') {
        throw new Error(message);
      } else {
        logger.warn('Using default values for missing environment variables in non-production environment');
      }
    }

    // Validate JWT secrets in production
    if (this.environment === 'production') {
      if (this.config.auth.jwt.accessSecret.length < 32) {
        throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long in production');
      }
      if (this.config.auth.jwt.refreshSecret.length < 32) {
        throw new Error('JWT_REFRESH_SECRET must be at least 32 characters long in production');
      }
    }

    logger.info('✅ Configuration validation completed successfully');
  }

  get(path) {
    return this.getNestedValue(this.config, path);
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }

  set(path, value) {
    this.setNestedValue(this.config, path, value);
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!(key in current)) {
        current[key] = {};
      }
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  getAll() {
    return { ...this.config };
  }

  isDevelopment() {
    return this.environment === 'development';
  }

  isStaging() {
    return this.environment === 'staging';
  }

  isProduction() {
    return this.environment === 'production';
  }

  isTest() {
    return this.environment === 'test';
  }
}

// Export singleton instance
const appConfig = new ApplicationConfig();
export default appConfig;
export { ApplicationConfig };
