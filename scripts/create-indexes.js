import mongoose from 'mongoose';
import { connectDatabase } from '#shared/database/connection-manager.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Creates database indexes for performance and uniqueness
 * @returns {Promise<void>}
 */
const createIndexes = async () => {
  try {
    await connectDatabase(baseConfig);

    const db = mongoose.connection;

    // User indexes for multi-tenant queries
    await db.collection('users').createIndex(
      { organizationId: 1, schoolId: 1, email: 1 },
      { unique: true, name: 'user_tenant_email_unique' }
    );

    await db.collection('users').createIndex(
      { organizationId: 1, status: 1, isDeleted: 1 },
      { name: 'user_tenant_status' }
    );

    // Audit log indexes
    await db.collection('auditlogs').createIndex(
      { tenantId: 1, createdAt: -1 },
      { name: 'audit_tenant_time' }
    );

    // Feature flag indexes
    await db.collection('featureflags').createIndex(
      { organizationId: 1, feature: 1 },
      { unique: true, name: 'feature_tenant_unique' }
    );

    logger.info('Database indexes created successfully');
    process.exit(0);
  } catch (error) {
    logger.error(`Index creation failed: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
};

createIndexes();