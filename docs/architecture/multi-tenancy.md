# Multi-Tenancy Architecture

## 1. Multi-Tenancy Overview

### 1.1 Tenancy Model
- **Strategy**: Single MongoDB database, separate collections per tenant
- **Isolation Level**: Logical separation with `tenantId` filtering
- **Resource Sharing**: Shared infrastructure (MongoDB, Redis)
- **Scaling**: Horizontal scaling with tenant-aware load balancing

### 1.2 Tenant Hierarchy

graph TD
    Org[Organization] --> School1[School 1]
    Org --> School2[School 2]
    Org --> SchoolN[School N]
    School1 --> Users1[Users]
    School1 --> Classes1[Classes]
    School1 --> Academic1[Academic Data]
    School2 --> Users2[Users]
    School2 --> Academic2[Academic Data]

2. Tenant Identification & Routing
2.1 Tenant Resolution Strategy
// src/core/tenant/services/tenant.service.js
import { School } from '#domain/models/school.model.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import { logger } from '#utils/core/logger.js';

/**
 * @typedef {Object} TenantContext
 * @property {string} tenantId - Unique tenant identifier
 * @property {Object} tenant - Tenant details
 * @property {string[]} permissions - Tenant permissions
 * @property {Object} subscription - Subscription details
 */

/**
 * @description Extracts and validates tenant ID from request
 * @param {Object} req - Express request object
 * @returns {string} Tenant ID
 * @throws {BusinessException} If tenant ID is invalid
 */
export async function extractTenantId(req) {
  const tenantId =
    req.headers['x-tenant-id'] ||
    req.headers['x-school-id'] ||
    (req.user?.tenantId) ||
    (req.subdomains.length > 0 && `school_${req.subdomains[0]}`) ||
    req.query.tenantId;

  if (!tenantId) {
    throw new BusinessException('Tenant ID not provided', 'TENANT_NOT_FOUND', 400);
  }

  const tenant = await School.findOne({ tenantId, status: 'active' });
  if (!tenant) {
    throw new BusinessException('Invalid or inactive tenant', 'TENANT_INVALID', 400);
  }

  return tenantId;
}

/**
 * @description Validates tenant and returns context
 * @param {string} tenantId - Tenant identifier
 * @returns {Promise<TenantContext>} Tenant context
 */
export async function validateTenant(tenantId) {
  const tenant = await School.findOne({ tenantId, status: 'active' }).lean();
  if (!tenant) {
    throw new BusinessException('Tenant not found or inactive', 'TENANT_INVALID', 400);
  }

  return {
    tenantId,
    tenant,
    permissions: tenant.permissions || [],
    subscription: tenant.subscription,
  };
}

2.2 Tenant Middleware Implementation
// src/core/tenant/middlewares/tenant.middleware.js
import { extractTenantId, validateTenant } from '#core/tenant/services/tenant.service.js';
import { DatabaseManager } from '#core/tenant/services/database-manager.service.js';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';

/**
 * @description Tenant middleware for Express
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Promise<void>}
 */
export const tenantMiddleware = async (req, res, next) => {
  try {
    const tenantId = await extractTenantId(req);
    const tenantContext = await validateTenant(tenantId);
    req.context = tenantContext;
    req.db = await DatabaseManager.getTenantConnection(tenantId);

    await AuditService.log('TENANT_CONTEXT_SET', {
      tenantId,
      action: 'tenant_resolution',
      path: req.path,
    });

    next();
  } catch (error) {
    logger.error(`Tenant middleware error: ${error.message}`, { tenantId: req.headers['x-tenant-id'] });
    next(new BusinessException(error.message, error.code || 'TENANT_ERROR', error.status || 400));
  }
};

2.3 Database Connection Management
// src/core/tenant/services/database-manager.service.js
import mongoose from 'mongoose';
import { config } from '#config/index.js';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';

/**
 * @description Manages tenant-specific database connections
 */
export class DatabaseManager {
  static connections = new Map();

  /**
   * @description Gets or creates a tenant-specific connection
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<mongoose.Connection>} MongoDB connection
   */
  static async getTenantConnection(tenantId) {
    try {
      if (this.connections.has(tenantId)) {
        return this.connections.get(tenantId);
      }

      const connection = await this.createTenantConnection(tenantId);
      this.connections.set(tenantId, connection);

      await AuditService.log('TENANT_CONNECTION_CREATED', { tenantId, action: 'db_connect' });
      return connection;
    } catch (error) {
      logger.error(`Failed to get tenant connection: ${error.message}`, { tenantId });
      throw error;
    }
  }

  /**
   * @description Creates a new tenant-specific connection
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<mongoose.Connection>} MongoDB connection
   */
  static async createTenantConnection(tenantId) {
    const dbName = `school_erp_${tenantId}`;
    const connection = await mongoose.createConnection(
      `${config.database.uri}/${dbName}`,
      {
        ...config.database.options,
        serverSelectionTimeoutMS: 15000, // From previous MongoDB fix
      }
    );

    logger.info(`Created tenant connection: ${dbName}`);
    return connection;
  }
}

3. Data Isolation Strategies
3.1 Collection-Level Isolation
All queries include tenantId:
// Example query
const students = await Student.find({
  tenantId: req.context.tenantId,
  'academic.classId': classId,
  status: 'active',
});

3.2 Database Query Middleware
// src/core/tenant/plugins/tenant.plugin.js
import mongoose from 'mongoose';
import { BusinessException } from '#shared/exceptions/business.exception.js';

/**
 * @description Mongoose plugin for tenant-aware queries
 * @param {mongoose.Schema} schema - Mongoose schema
 */
export function tenantPlugin(schema) {
  schema.add({ tenantId: { type: String, required: true, index: true } });

  schema.pre(/^find/, function (next) {
    if (this.getOptions().skipTenantFilter) return next();
    const tenantId = this.getOptions().tenantId;
    if (!tenantId) {
      throw new BusinessException('Tenant ID required', 'TENANT_REQUIRED', 400);
    }
    this.where({ tenantId });
    next();
  });

  schema.pre('save', function (next) {
    if (!this.tenantId && this.$locals.tenantId) {
      this.tenantId = this.$locals.tenantId;
    }
    next();
  });
}

3.3 Repository Pattern with Tenant Context
// src/core/repositories/base/tenant-aware.repository.js
import { BusinessException } from '#shared/exceptions/business.exception.js';
import { logger } from '#utils/core/logger.js';

/**
 * @typedef {Object} TenantAwareRepository
 * @property {mongoose.Model} model - Mongoose model
 * @property {string} tenantId - Tenant identifier
 */
export class TenantAwareRepository {
  /**
   * @param {mongoose.Model} model - Mongoose model
   * @param {string} tenantId - Tenant identifier
   */
  constructor(model, tenantId) {
    this.model = model;
    this.tenantId = tenantId;
  }

  /**
   * @description Finds documents with tenant filter
   * @param {Object} query - Query conditions
   * @param {Object} options - Query options
   * @returns {Promise<Object[]>} Documents
   */
  async find(query = {}, options = {}) {
    try {
      return await this.model.find({ ...query, tenantId: this.tenantId }, null, {
        ...options,
        tenantId: this.tenantId,
      });
    } catch (error) {
      logger.error(`Find error: ${error.message}`, { tenantId: this.tenantId, query });
      throw error;
    }
  }

  /**
   * @description Finds a document by ID
   * @param {string} id - Document ID
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Document
   */
  async findById(id, options = {}) {
    try {
      return await this.model.findOne({ _id: id, tenantId: this.tenantId }, null, {
        ...options,
        tenantId: this.tenantId,
      });
    } catch (error) {
      logger.error(`FindById error: ${error.message}`, { tenantId: this.tenantId, id });
      throw error;
    }
  }

  /**
   * @description Creates a document
   * @param {Object} data - Document data
   * @returns {Promise<Object>} Created document
   */
  async create(data) {
    try {
      return await this.model.create({ ...data, tenantId: this.tenantId });
    } catch (error) {
      logger.error(`Create error: ${error.message}`, { tenantId: this.tenantId, data });
      throw error;
    }
  }

  /**
   * @description Updates documents
   * @param {Object} query - Query conditions
   * @param {Object} update - Update operations
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Update result
   */
  async update(query, update, options = {}) {
    try {
      return await this.model.updateMany(
        { ...query, tenantId: this.tenantId },
        update,
        { ...options, tenantId: this.tenantId }
      );
    } catch (error) {
      logger.error(`Update error: ${error.message}`, { tenantId: this.tenantId, query });
      throw error;
    }
  }

  /**
   * @description Deletes documents
   * @param {Object} query - Query conditions
   * @returns {Promise<Object>} Delete result
   */
  async delete(query) {
    try {
      return await this.model.deleteMany({ ...query, tenantId: this.tenantId });
    } catch (error) {
      logger.error(`Delete error: ${error.message}`, { tenantId: this.tenantId, query });
      throw error;
    }
  }
}

4. Security & Access Control
Detailed in security-model.md.
5. Resource Management & Scaling
5.1 Tenant Resource Limits Middleware
// src/core/tenant/middlewares/resource-limit.middleware.js
import { BusinessException } from '#shared/exceptions/business.exception.js';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';

/**
 * @description Enforces tenant resource limits
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Promise<void>}
 */
export const resourceLimitMiddleware = async (req, res, next) => {
  try {
    const { tenant, action = 'read' } = req.context;

    switch (action) {
      case 'create_student':
        if (tenant.usage.currentStudents >= tenant.limits.maxStudents) {
          throw new BusinessException('Student limit exceeded', 'RESOURCE_LIMIT_EXCEEDED', 429);
        }
        break;
      case 'upload_file':
        if (tenant.usage.storageUsed >= tenant.limits.storageQuota) {
          throw new BusinessException('Storage quota exceeded', 'STORAGE_LIMIT_EXCEEDED', 429);
        }
        break;
    }

    await AuditService.log('RESOURCE_CHECK', {
      tenantId: tenant.tenantId,
      action,
      status: 'success',
    });

    next();
  } catch (error) {
    logger.error(`Resource limit check failed: ${error.message}`, { tenantId: req.context.tenantId });
    next(error);
  }
};

5.2 Tenant-Aware Cache Manager
// src/core/cache/services/tenant-cache.service.js
import Redis from 'ioredis';
import { config } from '#config/index.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Manages tenant-specific caching
 */
export class TenantCacheManager {
  static client = new Redis(config.redis.url);

  /**
   * @description Generates tenant-specific cache key
   * @param {string} tenantId - Tenant identifier
   * @param {string} key - Cache key
   * @returns {string} Tenant-prefixed cache key
   */
  static getCacheKey(tenantId, key) {
    return `tenant:${tenantId}:${key}`;
  }

  /**
   * @description Gets cached value
   * @param {string} tenantId - Tenant identifier
   * @param {string} key - Cache key
   * @returns {Promise<any>} Cached value
   */
  static async get(tenantId, key) {
    try {
      const cacheKey = this.getCacheKey(tenantId, key);
      const value = await this.client.get(cacheKey);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error(`Cache get error: ${error.message}`, { tenantId, key });
      throw error;
    }
  }

  /**
   * @description Sets cached value
   * @param {string} tenantId - Tenant identifier
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live in seconds
   * @returns {Promise<void>}
   */
  static async set(tenantId, key, value, ttl = 3600) {
    try {
      const cacheKey = this.getCacheKey(tenantId, key);
      await this.client.setex(cacheKey, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error(`Cache set error: ${error.message}`, { tenantId, key });
      throw error;
    }
  }

  /**
   * @description Invalidates cache keys
   * @param {string} tenantId - Tenant identifier
   * @param {string} pattern - Key pattern
   * @returns {Promise<void>}
   */
  static async invalidate(tenantId, pattern) {
    try {
      const searchPattern = this.getCacheKey(tenantId, pattern);
      const keys = await this.client.keys(`${searchPattern}*`);
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (error) {
      logger.error(`Cache invalidate error: ${error.message}`, { tenantId, pattern });
      throw error;
    }
  }
}

6. Data Migration & Management
6.1 Tenant Onboarding
// src/core/tenant/services/tenant-onboarding.service.js
import mongoose from 'mongoose';
import { Organization } from '#domain/models/organization.model.js';
import { School } from '#domain/models/school.model.js';
import { User } from '#domain/models/user.model.js';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';

/**
 * @description Onboards a new tenant
 * @param {Object} organizationData - Organization details
 * @param {Object} schoolData - School details
 * @returns {Promise<Object>} Created tenant details
 */
export async function onboardTenant(organizationData, schoolData) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const organization = await Organization.create([organizationData], { session });
      const tenantId = `school_${schoolData.slug.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}`;
      const school = await School.create(
        [{ ...schoolData, organizationId: organization[0]._id, tenantId }],
        { session }
      );
      const admin = await createDefaultAdmin(school[0]._id, tenantId, session);
      await setupDefaultConfigurations(school[0]._id, tenantId, session);

      await AuditService.log('TENANT_CREATED', {
        tenantId,
        schoolId: school[0]._id,
        organizationId: organization[0]._id,
      });

      result = { organization: organization[0], school: school[0], admin };
    });
    return result;
  } catch (error) {
    logger.error(`Tenant onboarding failed: ${error.message}`, { organizationData, schoolData });
    throw new BusinessException('Failed to onboard tenant', 'TENANT_ONBOARDING_FAILED', 500);
  } finally {
    await session.endSession();
  }
}

/**
 * @description Creates default admin user
 * @param {string} schoolId - School ID
 * @param {string} tenantId - Tenant ID
 * @param {mongoose.ClientSession} session - Mongoose session
 * @returns {Promise<Object>} Admin user
 */
async function createDefaultAdmin(schoolId, tenantId, session) {
  const admin = await User.create(
    [{
      schoolId,
      tenantId,
      personalInfo: { firstName: 'Admin', lastName: 'User' },
      auth: { email: `admin@${tenantId}.com`, passwordHash: 'hashed_password' },
      role: 'admin',
      permissions: ['users.*', 'students.*', 'classes.*'],
      status: 'active',
    }],
    { session }
  );
  return admin[0];
}

/**
 * @description Sets up default configurations
 * @param {string} schoolId - School ID
 * @param {string} tenantId - Tenant ID
 * @param {mongoose.ClientSession} session - Mongoose session
 * @returns {Promise<void>}
 */
async function setupDefaultConfigurations(schoolId, tenantId, session) {
  // Implement default settings (e.g., academic year, features)
}

7. Monitoring & Analytics
7.1 Tenant-Level Monitoring
// src/core/monitoring/services/tenant-metrics.service.js
import { User, Student } from '#domain/models/index.js';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';

/**
 * @description Collects tenant-specific metrics
 * @param {string} tenantId - Tenant identifier
 * @returns {Promise<Object>} Tenant metrics
 */
export async function collectTenantMetrics(tenantId) {
  try {
    const metrics = {
      tenantId,
      timestamp: new Date(),
      users: {
        total: await User.countDocuments({ tenantId, status: 'active' }),
        activeToday: await User.countDocuments({ tenantId, lastActiveAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        newThisMonth: await User.countDocuments({ tenantId, createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
      },
      students: {
        total: await Student.countDocuments({ tenantId, status: 'active' }),
        byClass: await Student.aggregate([
          { $match: { tenantId, status: 'active' } },
          { $group: { _id: '$academic.classId', count: { $sum: 1 } } },
        ]),
      },
      api: {
        callsToday: await AuditService.countLogs({ tenantId, action: 'api_request', createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        avgResponseTime: 0, // Implement with Prometheus
        errorRate: 0, // Implement with Prometheus
      },
      storage: {
        used: 0, // Implement with S3
        quota: 10 * 1024 * 1024 * 1024, // 10GB default
      },
    };

    await AuditService.log('METRICS_COLLECTED', { tenantId, action: 'collect_metrics', metrics });
    return metrics;
  } catch (error) {
    logger.error(`Metrics collection failed: ${error.message}`, { tenantId });
    throw error;
  }
}


Last Updated: 2025-08-24Version: 1.0