import baseConfig from './base.config.js';

/**
 * @description Test environment configuration
 * @type {Object}
 */
const testConfig = {
  ...baseConfig,
  env: 'test',
  logLevel: 'error',
  
  mongo: {
    ...baseConfig.mongo,
    uri: process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/school-erp-test',
  },

  jwt: {
    ...baseConfig.jwt,
    accessSecret: 'test-secret-key',
    refreshSecret: 'test-refresh-secret-key',
  },

  cors: {
    ...baseConfig.cors,
    allowedOrigins: ['*'],
  },

  rateLimit: {
    ...baseConfig.rateLimit,
    max: 10000, // Very lenient for tests
  },
};

export default testConfig;