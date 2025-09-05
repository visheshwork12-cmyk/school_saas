// src/shared/config/index.js
import pkg from "lodash";
const { merge } = pkg;
import Joi from "joi";
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { cloudinaryConfig } from "./cloudinary.config.js";
import baseConfig from "#config/environments/base.config.js";
import developmentConfig from "#config/environments/development.config.js";
import productionConfig from "#config/environments/production.config.js";
import stagingConfig from "#config/environments/staging.config.js";
import testConfig from "#config/environments/test.config.js";
import localConfig from "#config/environments/local.config.js";

// Type definitions remain unchanged
/**
 * @typedef {Object} MongoConfig
 * @property {string} uri - MongoDB connection URI
 * @property {Object} options - MongoDB connection options
 * @property {number} [options.maxPoolSize] - Maximum pool size
 * @property {number} [options.serverSelectionTimeoutMS] - Server selection timeout
 * @property {number} [options.socketTimeoutMS] - Socket timeout
 * @property {boolean} [options.useNewUrlParser] - Use new URL parser
 * @property {boolean} [options.useUnifiedTopology] - Use unified topology
 * @property {boolean} [options.retryWrites] - Enable retryable writes
 * @property {boolean} [options.retryReads] - Enable retryable reads
 * @property {number} [options.heartbeatFrequencyMS] - Heartbeat frequency
 */

/**
 * @typedef {Object} JwtConfig
 * @property {string} [secret] - Legacy JWT secret
 * @property {string} [accessSecret] - JWT access token secret
 * @property {string} [refreshSecret] - JWT refresh token secret
 * @property {string} [expiry] - Legacy token expiry
 * @property {string} accessExpiresIn - Access token expiry
 * @property {string} refreshExpiresIn - Refresh token expiry
 */

/**
 * @typedef {Object} CloudinaryConfig
 * @property {string} cloud_name - Cloudinary cloud name
 * @property {string} api_key - Cloudinary API key
 * @property {string} api_secret - Cloudinary API secret
 * @property {boolean} secure - Use HTTPS
 * @property {string} folder - Default upload folder
 * @property {string} upload_preset - Upload preset
 */

/**
 * @typedef {Object} FileUploadConfig
 * @property {number} maxFileSize - Maximum file size in bytes
 * @property {number} maxFiles - Maximum number of files
 * @property {string[]} allowedTypes - Allowed MIME types
 * @property {Object} categories - File categories configuration
 */

/**
 * @typedef {Object} Config
 * @property {number} port - Application port
 * @property {string} env - Environment name
 * @property {string} appName - Application name
 * @property {MongoConfig} mongo - MongoDB configuration
 * @property {JwtConfig} jwt - JWT configuration
 * @property {CloudinaryConfig} cloudinary - Cloudinary configuration
 * @property {FileUploadConfig} fileUpload - File upload configuration
 * @property {Object} cache - Cache configuration
 * @property {Object} redis - Redis configuration
 * @property {Object} rateLimit - Rate limiting configuration
 * @property {Object} bodyParser - Body parser configuration
 * @property {Object} compression - Compression configuration
 * @property {Object} server - Server configuration
 * @property {Object} bcrypt - Bcrypt configuration
 * @property {Object} cors - CORS configuration
 * @property {Object} multiTenant - Multi-tenant configuration
 * @property {Object} subscription - Subscription configuration
 * @property {Object} auth - Authentication configuration
 * @property {Object} versioning - Versioning configuration
 * @property {Object} featureFlags - Feature flags
 * @property {Object} aws - AWS configuration
 * @property {Object} smtp - SMTP configuration
 * @property {string} logLevel - Logging level
 * @property {Object} paths - File system paths
 * @property {string} paths.docs - Documentation directory
 */

/**
 * Selects environment-specific configuration based on NODE_ENV.
 * @param {string} env - Environment name
 * @returns {Object} Environment-specific configuration
 * @throws {Error} If environment is invalid
 */
const selectEnvConfig = (env) => {
  switch (env) {
    case "development":
      return developmentConfig;
    case "production":
      return productionConfig;
    case "staging":
      return stagingConfig;
    case "test":
      return testConfig;
    case "local":
      return localConfig;
    default:
      logger.error(`Invalid NODE_ENV: ${env}`, { env });
      throw new Error(`Invalid NODE_ENV: ${env}`);
  }
};

/**
 * Defines Joi schema for configuration validation.
 * @returns {Joi.ObjectSchema} Joi schema
 */
const getConfigSchema = () => {
  return Joi.object({
    port: Joi.number().default(3000),
    env: Joi.string()
      .valid("development", "production", "staging", "test", "local")
      .required(),
    appName: Joi.string().default("School ERP SaaS"),
    mongo: Joi.object({
      uri: Joi.string().uri().required(),
      options: Joi.object({
        maxPoolSize: Joi.number().min(1).default(10),
        serverSelectionTimeoutMS: Joi.number().default(15000),
        socketTimeoutMS: Joi.number().default(45000),
        useNewUrlParser: Joi.boolean().optional(),
        useUnifiedTopology: Joi.boolean().optional(),
        retryWrites: Joi.boolean().optional(),
        retryReads: Joi.boolean().optional(),
        heartbeatFrequencyMS: Joi.number().optional(),
      }).default(),
    }).required(),
    jwt: Joi.object({
      secret: Joi.string().min(32).optional(),
      accessSecret: Joi.string().min(32).optional(),
      refreshSecret: Joi.string().min(32).optional(),
      expiry: Joi.string().optional(),
      accessExpiresIn: Joi.string().default("15m"),
      refreshExpiresIn: Joi.string().default("7d"),
    }).required(),
    // Cloudinary configuration validation
    cloudinary: Joi.object({
      cloud_name: Joi.string().required(),
      api_key: Joi.string().required(),
      api_secret: Joi.string().required(),
      secure: Joi.boolean().default(true),
      folder: Joi.string().default("school-erp"),
      upload_preset: Joi.string().optional(),
    }).required(),
    // File upload configuration validation
    fileUpload: Joi.object({
      maxFileSize: Joi.number().min(1024).default(10 * 1024 * 1024), // 10MB
      maxFiles: Joi.number().min(1).default(5),
      allowedTypes: Joi.array().items(Joi.string()).default([
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ]),
      categories: Joi.object({
        profile_pictures: Joi.object({
          maxSize: Joi.number().default(5 * 1024 * 1024), // 5MB
          allowedTypes: Joi.array().items(Joi.string()).default(['image/jpeg', 'image/png', 'image/webp'])
        }).default(),
        assignments: Joi.object({
          maxSize: Joi.number().default(10 * 1024 * 1024), // 10MB
          allowedTypes: Joi.array().items(Joi.string()).default(['application/pdf', 'image/jpeg', 'image/png'])
        }).default(),
        documents: Joi.object({
          maxSize: Joi.number().default(15 * 1024 * 1024), // 15MB
          allowedTypes: Joi.array().items(Joi.string()).default([
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ])
        }).default(),
      }).default(),
    }).default(),
    cache: Joi.object({
      ttl: Joi.number().min(1).default(600),
      checkperiod: Joi.number().min(1).default(60),
      maxKeys: Joi.number().min(1).default(10000),
    }).default(),
    redis: Joi.object({
      url: Joi.string().uri().optional(),
    }).optional(),
    rateLimit: Joi.object({
      windowMs: Joi.number().min(1000).default(15 * 60 * 1000),
      max: Joi.number().min(1).default(100),
    }).default(),
    bodyParser: Joi.object({
      jsonLimit: Joi.string().default("1mb"),
      urlencodedLimit: Joi.string().default("1mb"),
    }).default(),
    compression: Joi.object({
      level: Joi.number().min(1).max(9).default(6),
    }).default(),
    server: Joi.object({
      timeout: Joi.number().min(1000).default(30000),
    }).default(),
    bcrypt: Joi.object({
      saltRounds: Joi.number().min(8).max(15).default(12),
    }).default(),
    cors: Joi.object({
      allowedOrigins: Joi.array().items(Joi.string()).default(["*"]),
      methods: Joi.string().default("GET,HEAD,PUT,PATCH,POST,DELETE"),
      credentials: Joi.boolean().default(false),
    }).default(),
    multiTenant: Joi.object({
      mode: Joi.string().valid("header", "subdomain", "path").default("header"),
      defaultTenantId: Joi.string().default("default"),
      tenantHeaderName: Joi.string().default("x-tenant-id"),
      isolationLevel: Joi.string().valid("row", "database", "schema").default("row"),
    }).default(),
    subscription: Joi.object({
      defaultTrialDays: Joi.number().min(1).default(30),
      gracePeriodDays: Joi.number().min(1).default(7),
      trialFeatures: Joi.array().items(Joi.string()).default(["ACADEMIC", "ATTENDANCE"]),
      trialLimits: Joi.object({
        students: Joi.number().min(1).default(50),
        teachers: Joi.number().min(1).default(5),
        storage: Joi.number().min(1).default(1),
      }).default(),
      plans: Joi.object().default({}),
    }).default(),
    auth: Joi.object({
      maxLoginAttempts: Joi.number().min(1).default(5),
      lockoutTimeMinutes: Joi.number().min(1).default(15),
      passwordResetExpiryHours: Joi.number().min(1).default(1),
      sessionTimeoutMinutes: Joi.number().min(1).default(60),
    }).default(),
    versioning: Joi.object({
      currentApiVersion: Joi.string().default("1.0.0"),
      defaultVersion: Joi.string().default("1.0.0"),
      supportedVersions: Joi.array().items(Joi.string()).default(["1.0.0"]),
      slowTransformationThresholdMs: Joi.number().default(1000),
    }).default(),
    featureFlags: Joi.object().default({}),
    aws: Joi.object().optional(),
    smtp: Joi.object().optional(),
    logLevel: Joi.string()
      .valid("error", "warn", "info", "debug", "verbose")
      .default("info"),
    paths: Joi.object({
      docs: Joi.string().default("docs"),
    }).default(),
  }).unknown(true);
};

/**
 * Validates configuration using Joi schema.
 * @param {Object} config - Configuration to validate
 * @param {Joi.ObjectSchema} schema - Joi schema
 * @returns {Object} Validated configuration
 * @throws {Error} If validation fails
 */
const validateConfig = (config, schema) => {
  const { error, value } = schema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: false,
  });

  if (error) {
    const errorMessage = error.details.map((d) => d.message).join(", ");
    logger.error(`Configuration validation failed: ${errorMessage}`, { env: config.env });
    throw new Error(`Configuration validation failed: ${errorMessage}`);
  }
  return value;
};

/**
 * Ensures JWT configuration compatibility.
 * @param {Object} config - Configuration object
 */
const ensureJwtCompatibility = (config) => {
  if (config.jwt.secret && !config.jwt.accessSecret) {
    config.jwt.accessSecret = config.jwt.secret;
    config.jwt.refreshSecret = config.jwt.secret;
  }
};

/**
 * Ensures auth configuration defaults.
 * @param {Object} config - Configuration object
 */
const ensureAuthConfig = (config) => {
  if (!config.auth) {
    config.auth = {
      maxLoginAttempts: 5,
      lockoutTimeMinutes: 15,
      passwordResetExpiryHours: 1,
      sessionTimeoutMinutes: 60,
    };
  }
};

/**
 * Ensures Cloudinary configuration.
 * @param {Object} config - Configuration object
 */
const ensureCloudinaryConfig = (config) => {
  if (!config.cloudinary) {
    config.cloudinary = cloudinaryConfig;
    logger.info('Cloudinary configuration added from cloudinary.config.js');
  }
};

/**
 * Ensures file upload configuration.
 * @param {Object} config - Configuration object
 */
const ensureFileUploadConfig = (config) => {
  if (!config.fileUpload) {
    config.fileUpload = {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      allowedTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      categories: {
        profile_pictures: {
          maxSize: 5 * 1024 * 1024, // 5MB
          allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
        },
        assignments: {
          maxSize: 10 * 1024 * 1024, // 10MB
          allowedTypes: ['application/pdf', 'image/jpeg', 'image/png']
        },
        documents: {
          maxSize: 15 * 1024 * 1024, // 15MB
          allowedTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          ]
        },
      }
    };
  }
};

/**
 * Loads and validates environment-based configuration.
 * @returns {Config} Validated configuration object
 * @throws {Error} If validation fails or environment is invalid
 */
const loadConfig = () => {
  const env = process.env.NODE_ENV || "development";
  try {
    const envConfig = selectEnvConfig(env);
    const config = merge({}, baseConfig, envConfig, {
      // Add Cloudinary config
      cloudinary: cloudinaryConfig,
      // Add file upload config
      fileUpload: {
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        allowedTypes: [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        categories: {
          profile_pictures: {
            maxSize: 5 * 1024 * 1024, // 5MB
            allowedTypes: ['image/jpeg', 'image/png', 'image/webp']
          },
          assignments: {
            maxSize: 10 * 1024 * 1024, // 10MB
            allowedTypes: ['application/pdf', 'image/jpeg', 'image/png']
          },
          documents: {
            maxSize: 15 * 1024 * 1024, // 15MB
            allowedTypes: [
              'application/pdf',
              'application/msword',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            ]
          },
        }
      },
      paths: {
        docs: "docs",
      },
    });

    const schema = getConfigSchema();
    const validatedConfig = validateConfig(config, schema);

    ensureJwtCompatibility(validatedConfig);
    ensureAuthConfig(validatedConfig);
    ensureCloudinaryConfig(validatedConfig);
    ensureFileUploadConfig(validatedConfig);

    logger.info(`Configuration loaded successfully for environment: ${env}`, {
      cloudinary: {
        configured: !!validatedConfig.cloudinary.cloud_name,
        cloud_name: validatedConfig.cloudinary.cloud_name
      },
      fileUpload: {
        maxFileSize: validatedConfig.fileUpload.maxFileSize,
        maxFiles: validatedConfig.fileUpload.maxFiles
      }
    });

    AuditService.log("CONFIG_LOAD", {
      action: "config_load",
      status: "success",
      environment: env,
      cloudinary_configured: !!validatedConfig.cloudinary.cloud_name,
    });

    return validatedConfig;
  } catch (error) {
    logger.error(`Failed to load configuration: ${error.message}`, { env });
    throw error;
  }
};

// Export validated config
let configInstance;
try {
  configInstance = loadConfig();
} catch (error) {
  logger.error("Failed to load configuration:", error.message);
  process.exit(1);
}

export default configInstance;
