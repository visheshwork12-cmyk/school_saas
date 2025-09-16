// src/core/cache/services/elasticache-tenant-cache.service.js
import ElastiCacheRedis from '#infrastructure/cache/elasticache-redis.js';
import { logger } from '#utils/core/logger.js';

class ElastiCacheTenantCacheService {
  constructor() {
    this.client = null;
    this.defaultTTL = 3600; // 1 hour
    this.tenantPrefix = 'tenant:';
  }

  async initialize() {
    this.client = await ElastiCacheRedis.initialize();
  }

  // Tenant-specific key generation
  generateTenantKey(tenantId, key) {
    return `${this.tenantPrefix}${tenantId}:${key}`;
  }

  // Multi-tenant get with fallback
  async get(tenantId, key, fallbackFn = null) {
    try {
      const tenantKey = this.generateTenantKey(tenantId, key);
      const cached = await this.client.get(tenantKey);
      
      if (cached !== null) {
        logger.debug(`Cache HIT: ${tenantKey}`);
        return JSON.parse(cached);
      }

      logger.debug(`Cache MISS: ${tenantKey}`);
      
      if (fallbackFn && typeof fallbackFn === 'function') {
        const data = await fallbackFn();
        if (data !== undefined) {
          await this.set(tenantId, key, data);
        }
        return data;
      }

      return null;
    } catch (error) {
      logger.error(`ElastiCache get error for tenant ${tenantId}: ${error.message}`);
      
      // Fallback to function if cache fails
      if (fallbackFn && typeof fallbackFn === 'function') {
        return await fallbackFn();
      }
      
      return null;
    }
  }

  // Multi-tenant set
  async set(tenantId, key, value, ttl = this.defaultTTL) {
    try {
      const tenantKey = this.generateTenantKey(tenantId, key);
      const serialized = JSON.stringify(value);
      
      if (ttl > 0) {
        await this.client.setex(tenantKey, ttl, serialized);
      } else {
        await this.client.set(tenantKey, serialized);
      }
      
      logger.debug(`Cache SET: ${tenantKey} (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      logger.error(`ElastiCache set error for tenant ${tenantId}: ${error.message}`);
      return false;
    }
  }

  // Batch operations for performance
  async mget(tenantId, keys) {
    try {
      const tenantKeys = keys.map(key => this.generateTenantKey(tenantId, key));
      const results = await this.client.mget(tenantKeys);
      
      return results.map((result, index) => ({
        key: keys[index],
        value: result ? JSON.parse(result) : null,
        found: result !== null
      }));
    } catch (error) {
      logger.error(`ElastiCache mget error for tenant ${tenantId}: ${error.message}`);
      return keys.map(key => ({ key, value: null, found: false }));
    }
  }

  // Pipeline operations for bulk writes
  async mset(tenantId, keyValuePairs, ttl = this.defaultTTL) {
    try {
      const pipeline = this.client.pipeline();
      
      keyValuePairs.forEach(({ key, value }) => {
        const tenantKey = this.generateTenantKey(tenantId, key);
        const serialized = JSON.stringify(value);
        
        if (ttl > 0) {
          pipeline.setex(tenantKey, ttl, serialized);
        } else {
          pipeline.set(tenantKey, serialized);
        }
      });
      
      await pipeline.exec();
      logger.debug(`Cache MSET: ${keyValuePairs.length} keys for tenant ${tenantId}`);
      return true;
    } catch (error) {
      logger.error(`ElastiCache mset error for tenant ${tenantId}: ${error.message}`);
      return false;
    }
  }

  // Delete with pattern support
  async delete(tenantId, key) {
    try {
      const tenantKey = this.generateTenantKey(tenantId, key);
      const result = await this.client.del(tenantKey);
      logger.debug(`Cache DELETE: ${tenantKey}`);
      return result > 0;
    } catch (error) {
      logger.error(`ElastiCache delete error for tenant ${tenantId}: ${error.message}`);
      return false;
    }
  }

  // Flush all tenant data
  async flushTenant(tenantId) {
    try {
      const pattern = this.generateTenantKey(tenantId, '*');
      const keys = await this.client.keys(pattern);
      
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.info(`Flushed ${keys.length} keys for tenant ${tenantId}`);
      }
      
      return keys.length;
    } catch (error) {
      logger.error(`ElastiCache flush error for tenant ${tenantId}: ${error.message}`);
      return 0;
    }
  }

  // Session management
  async setSession(tenantId, userId, sessionData, ttl = 86400) { // 24 hours
    const sessionKey = `session:${userId}`;
    return await this.set(tenantId, sessionKey, sessionData, ttl);
  }

  async getSession(tenantId, userId) {
    const sessionKey = `session:${userId}`;
    return await this.get(tenantId, sessionKey);
  }

  async deleteSession(tenantId, userId) {
    const sessionKey = `session:${userId}`;
    return await this.delete(tenantId, sessionKey);
  }

  // School-specific caching patterns
  async cacheStudentData(tenantId, studentId, data, ttl = 3600) {
    const key = `student:${studentId}`;
    return await this.set(tenantId, key, data, ttl);
  }

  async getStudentData(tenantId, studentId) {
    const key = `student:${studentId}`;
    return await this.get(tenantId, key);
  }

  async cacheClassData(tenantId, classId, data, ttl = 7200) { // 2 hours
    const key = `class:${classId}`;
    return await this.set(tenantId, key, data, ttl);
  }

  async cacheAttendanceData(tenantId, date, classId, data, ttl = 86400) { // 1 day
    const key = `attendance:${date}:${classId}`;
    return await this.set(tenantId, key, data, ttl);
  }
}

export default new ElastiCacheTenantCacheService();
