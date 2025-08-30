import mongoose from 'mongoose';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { CacheService } from '#core/cache/services/unified-cache.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import HTTP_STATUS from '#constants/http-status.js';

/**
 * @description Schema for audit logs
 * @type {mongoose.Schema}
 */
const auditLogSchema = new mongoose.Schema(
  {
    eventType: { type: String, required: true, index: true },
    tenantId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    requestId: { type: String, index: true },
    action: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, default: Date.now, index: { expires: '90d' } },
  },
  {
    timestamps: false,
  }
);

const AuditLogModel = mongoose.model('AuditLog', auditLogSchema);

/**
 * @description Service for managing audit logs
 */
class AuditService {
  /**
   * @description Checks if database is ready
   * @returns {boolean} Database readiness status
   * @private
   */
  static #isDatabaseReady() {
    return mongoose.connection.readyState === 1; // 1 = connected
  }

  /**
   * @description Logs an audit event
   * @param {string} eventType - Type of event (e.g., REQUEST_START, ERROR)
   * @param {Object} details - Event details
   * @param {Object} [context={}] - Request context (tenantId, userId, requestId)
   * @returns {Promise<void>}
   */
  static async log(eventType, details, context = {}) {
    try {
      const auditLog = {
        eventType,
        tenantId: context.tenantId || baseConfig.multiTenant.defaultTenantId,
        userId: context.userId || null,
        requestId: context.requestId,
        action: details.action || eventType,
        details,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      };

      // Check database readiness
      if (!this.#isDatabaseReady()) {
        logger.warn(`Database not ready for audit log: ${eventType}`, { tenantId: auditLog.tenantId });
        return;
      }

      // Store in MongoDB
      await AuditLogModel.create(auditLog);

      // Cache recent logs in Redis (production only)
      if (baseConfig.env === 'production' && baseConfig.redis.url) {
        const cacheKey = `audit:${context.tenantId || 'default'}:${eventType}:${context.requestId}`;
        await CacheService.set(cacheKey, auditLog, baseConfig.cache.ttl, context.tenantId);
      }

      logger.debug(`Audit log created: ${eventType}`, { tenantId: auditLog.tenantId });
    } catch (error) {
      logger.error(`Failed to create audit log: ${error.message}`, { eventType });
      // Do not throw during server initialization to prevent crashes
      if (eventType !== 'CACHE_INITIALIZED' && eventType !== 'CACHE_INIT_PARTIAL') {
        throw new BusinessException('Audit log creation failed');
      }
    }
  }

  /**
   * @description Retrieves audit logs with filters
   * @param {Object} query - Query filters
   * @param {string} query.tenantId - Tenant ID
   * @param {string} [query.eventType] - Event type
   * @param {string} [query.userId] - User ID
   * @param {string} [query.requestId] - Request ID
   * @param {Date} [query.startDate] - Start date
   * @param {Date} [query.endDate] - End date
   * @param {Object} context - Request context
   * @returns {Promise<Object[]>} Array of audit logs
   */
  static async getLogs({ tenantId, eventType, userId, requestId, startDate, endDate }, context) {
    try {
      // Check subscription access
      if (!context.subscription?.plan || !this.hasAuditAccess(context.subscription.plan)) {
        throw new BusinessException('Insufficient subscription for audit log access', HTTP_STATUS.FORBIDDEN);
      }

      const cacheKey = `audit:logs:${tenantId}:${eventType || '*'}:${requestId || '*'}`;
      let logs = await CacheService.get(cacheKey, tenantId);

      if (logs) {
        return logs;
      }

      if (!this.#isDatabaseReady()) {
        throw new BusinessException('Database not available for audit log retrieval');
      }

      const query = { tenantId };
      if (eventType) {query.eventType = eventType;}
      if (userId) {query.userId = userId;}
      if (requestId) {query.requestId = requestId;}
      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {query.createdAt.$gte = startDate;}
        if (endDate) {query.createdAt.$lte = endDate;}
      }

      logs = await AuditLogModel.find(query)
        .lean()
        .limit(100)
        .sort({ createdAt: -1 });

      // Cache results
      await CacheService.set(cacheKey, logs, baseConfig.cache.ttl, tenantId);

      logger.debug(`Audit logs retrieved: ${logs.length}`, { tenantId });
      return logs;
    } catch (error) {
      logger.error(`Failed to retrieve audit logs: ${error.message}`, { tenantId });
      throw new BusinessException('Audit log retrieval failed');
    }
  }

  /**
   * @description Checks if subscription plan allows audit log access
   * @param {string} plan - Subscription plan
   * @returns {boolean} Access status
   * @private
   */
  static hasAuditAccess(plan) {
    const allowedPlans = ['PREMIUM'];
    return allowedPlans.includes(plan);
  }

  /**
   * @description Cleans up old audit logs
   * @param {string} tenantId - Tenant ID
   * @param {Date} beforeDate - Delete logs before this date
   * @returns {Promise<number>} Number of deleted logs
   */
  static async cleanupLogs(tenantId, beforeDate) {
    try {
      if (!this.#isDatabaseReady()) {
        throw new BusinessException('Database not available for audit log cleanup');
      }

      const result = await AuditLogModel.deleteMany({
        tenantId,
        createdAt: { $lt: beforeDate },
      });

      await CacheService.invalidate(`audit:${tenantId}:*`, tenantId);
      logger.info(`Cleaned up ${result.deletedCount} audit logs`, { tenantId });
      return result.deletedCount;
    } catch (error) {
      logger.error(`Audit log cleanup failed: ${error.message}`, { tenantId });
      throw new BusinessException('Audit log cleanup failed');
    }
  }
}

export { AuditService };