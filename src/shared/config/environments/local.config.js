import baseConfig from './base.config.js';

/**
 * @description Local environment configuration
 * @type {Object}
 */
const localConfig = {
  ...baseConfig,
  env: 'local',
  logLevel: 'debug',
  
  mongo: {
    ...baseConfig.mongo,
    uri: 'mongodb://localhost:27017/school-erp-local',
  },

  cors: {
    ...baseConfig.cors,
    allowedOrigins: ['*'],
  },

  rateLimit: {
    ...baseConfig.rateLimit,
    max: 10000, // Very lenient for local dev
  },

  jwt: {
    ...baseConfig.jwt,
    accessSecret: process.env.JWT_ACCESS_SECRET || 'local-secret-key',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'local-refresh-secret-key',
  },
};

export default localConfig;