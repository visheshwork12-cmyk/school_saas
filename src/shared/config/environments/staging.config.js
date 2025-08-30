import baseConfig from './base.config.js';
import { BusinessException } from '#exceptions/business.exception.js';

/**
 * @description Staging environment configuration
 * @type {Object}
 */
const stagingConfig = {
  ...baseConfig,
  env: 'staging',
  logLevel: 'info',
  
  mongo: {
    ...baseConfig.mongo,
    uri: process.env.MONGODB_URI || throwError('MONGODB_URI required in staging'),
  },

  cors: {
    ...baseConfig.cors,
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['https://staging.yourapp.com'],
  },

  rateLimit: {
    ...baseConfig.rateLimit,
    max: 500, // Balanced for staging
  },
};

/**
 * @description Throws error for missing variables
 * @param {string} variable - Variable name
 * @throws {BusinessException}
 */
function throwError(variable) {
  throw new BusinessException(`${variable} must be set in staging`);
}

export default stagingConfig;