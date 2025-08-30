import { createClient } from 'redis';
import NodeCache from 'node-cache';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { BusinessException } from '#exceptions/business.exception.js';

/**
 * @description Cache management service with Redis and memory cache support
 */
class CacheService {
  /**
   * @description Initializes cache client
   * @private
   */
  static #client = null;
  static #memoryCache = new NodeCache({ stdTTL: baseConfig.cache.ttl, checkperiod: 120 });

  /**
   * @description Gets cache client (Redis or memory)
   * @returns {Promise<Object>} Cache client
   * @private
   */
  static async #getClient() {
    if (baseConfig.env === 'production' && baseConfig.redis.url) {
      if (!this.#client) {
        this.#client = createClient({ url: baseConfig.redis.url });
        this.#client.on('error', err => logger.error(`Redis error: ${err.message}`));
        await this.#client.connect();
        logger.info('Redis client connected');
      }
      return this.#client;
    }
    return this.#memoryCache;
  }

  /**
   * @description Gets value from cache with tenant prefix
   * @param {string} key - Cache key
   * @param {string} [tenantId='default'] - Tenant ID
   * @returns {Promise<any>} Cached value
   */
  static async get(key, tenantId = 'default') {
    try {
      const client = await this.#getClient();
      const tenantKey = `${tenantId}:${key}`;
      
      if (client instanceof NodeCache) {
        return client.get(tenantKey);
      }
      return await client.get(tenantKey);
    } catch (err) {
      logger.warn(`Cache get failed: ${err.message}`);
      return null;
    }
  }

  /**
   * @description Sets value in cache with tenant prefix
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttl - Time to live (seconds)
   * @param {string} [tenantId='default'] - Tenant ID
   * @returns {Promise<boolean>} Success
   */
  static async set(key, value, ttl, tenantId = 'default') {
    try {
      const client = await this.#getClient();
      const tenantKey = `${tenantId}:${key}`;
      
      if (client instanceof NodeCache) {
        return client.set(tenantKey, value, ttl);
      }
      return await client.setEx(tenantKey, ttl, JSON.stringify(value));
    } catch (err) {
      logger.error(`Cache set failed: ${err.message}`);
      throw new BusinessException('Cache operation failed');
    }
  }

  /**
   * @description Invalidates cache keys by pattern
   * @param {string} pattern - Key pattern (e.g., 'feature:*')
   * @param {string} [tenantId='default'] - Tenant ID
   * @returns {Promise<void>}
   */
  static async invalidate(pattern, tenantId = 'default') {
    try {
      const client = await this.#getClient();
      const tenantPattern = `${tenantId}:${pattern}`;
      
      if (client instanceof NodeCache) {
        const keys = client.keys();
        keys.forEach(key => {
          if (key.includes(tenantPattern.replace('*', ''))) {
            client.del(key);
          }
        });
      } else {
        const keys = await client.keys(tenantPattern);
        if (keys.length) {
          await client.del(keys);
        }
      }
      logger.debug(`Cache invalidated for pattern: ${tenantPattern}`);
    } catch (err) {
      logger.error(`Cache invalidate failed: ${err.message}`);
      throw new BusinessException('Cache invalidation failed');
    }
  }
}

export { CacheService };