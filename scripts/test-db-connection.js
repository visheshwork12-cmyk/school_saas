// scripts/test-db-connection.js
import config from '#shared/config/index.js'; // Main config loader
import { logger } from '#utils/core/logger.js'; // Logger utility
import mongoose from 'mongoose'; // MongoDB driver

/**
 * @typedef {Object} MongoConfig
 * @property {string} uri - MongoDB connection URI
 * @property {Object} options - MongoDB connection options
 * @property {number} options.maxPoolSize - Connection pool size
 * @property {number} options.serverSelectionTimeoutMS - Server selection timeout
 * @property {number} options.socketTimeoutMS - Socket timeout
 */

/**
 * Tests the database connection using the loaded configuration.
 * Handles multi-tenant context if applicable, but for test, uses base config.
 * @async
 * @function testDbConnection
 * @returns {Promise<void>}
 * @throws {Error} If connection fails or config is invalid.
 */
async function testDbConnection() {
  try {
    // Input validation and sanitization
    if (!config.mongo || typeof config.mongo.uri !== 'string') {
      throw new Error('Invalid database configuration: URI missing or invalid.');
    }

    // Security: Use environment-based config to avoid hardcoding secrets
    const dbUri = config.mongo.uri; // e.g., process.env.MONGODB_URI
    const dbOptions = {
      ...config.mongo.options, // Use options from config (excludes deprecated options)
    };

    // Multi-tenant context handling
    const tenantContext = config.multiTenant?.defaultTenantId || 'global';
    logger.info(`Attempting DB connection for tenant: ${tenantContext}`);

    // Connect with error handling
    await mongoose.connect(dbUri, dbOptions);
    logger.info('Database connection successful.');

    // Audit logging
    logger.audit({
      action: 'db_connection_test',
      status: 'success',
      tenant: tenantContext,
    });

    // Graceful shutdown
    await mongoose.disconnect();
    logger.info('Database connection closed.');
  } catch (error) {
    logger.error(`DB connection test failed: ${error.message}`);
    // Error tracking: In production, integrate with sentry.client.js
    // sentry.captureException(error);
    throw error; // Rethrow to handle in caller
  }
}

// Execute the test with top-level error handling
(async () => {
  try {
    await testDbConnection();
    logger.info('Database test completed successfully.');
    process.exit(0);
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
    process.exit(1);
  }
})();

// Health monitoring: Export for potential integration
export { testDbConnection };