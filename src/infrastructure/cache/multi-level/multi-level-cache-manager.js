// src/infrastructure/cache/multi-level/multi-level-cache-manager.js
import { logger } from "#utils/core/logger.js";
import { redisClusterManager } from "../redis/redis-cluster-manager.js";
import NodeCache from "node-cache";

/**
 * Multi-Level Cache Manager
 * Implements L1 (Memory) and L2 (Redis) caching with intelligent fallback
 */
export class MultiLevelCacheManager {
  constructor() {
    // L1 Cache (Memory) - Fast but limited
    this.l1Cache = new NodeCache({
      stdTTL: 300, // 5 minutes default TTL
      checkperiod: 60, // Check for expired keys every minute
      useClones: false, // Performance optimization
      maxKeys: 10000, // Limit memory usage
      deleteOnExpire: true
    });

    // Cache statistics
    this.stats = {
      l1: { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 },
      l2: { hits: 0, misses: 0, sets: 0, deletes: 0, errors: 0 },
      total: { requests: 0, l1HitRate: 0, l2HitRate: 0, overallHitRate: 0 }
    };

    // Cache configuration
    this.config = {
      l1: {
        enabled: true,
        maxMemoryMB: parseInt(process.env.L1_CACHE_MAX_MEMORY) || 100,
        defaultTTL: 300, // 5 minutes
        maxKeys: 10000
      },
      l2: {
        enabled: true,
        defaultTTL: 3600, // 1 hour
        compressionThreshold: 1024 // Compress values larger than 1KB
      },
      fallbackStrategy: process.env.CACHE_FALLBACK_STRATEGY || 'L2_ONLY', // L1_ONLY, L2_ONLY, SKIP
      enableMetrics: true
    };

    this.initializeL1Cache();
    this.setupMetricsCollection();
  }

  /**
   * Initialize L1 cache with event handlers
   */
  initializeL1Cache() {
    // L1 cache event handlers
    this.l1Cache.on('set', (key, value) => {
      this.stats.l1.sets++;
      logger.debug(`L1 cache set: ${key}`);
    });

    this.l1Cache.on('del', (key, value) => {
      this.stats.l1.deletes++;
      logger.debug(`L1 cache delete: ${key}`);
    });

    this.l1Cache.on('expired', (key, value) => {
      logger.debug(`L1 cache expired: ${key}`);
    });

    this.l1Cache.on('flush', () => {
      logger.info('L1 cache flushed');
    });
  }

  /**
   * Get value from cache with multi-level fallback
   */
  async get(key, options = {}) {
    const startTime = Date.now();
    this.stats.total.requests++;

    try {
      // Try L1 cache first
      if (this.config.l1.enabled) {
        const l1Value = this.l1Cache.get(key);
        if (l1Value !== undefined) {
          this.stats.l1.hits++;
          logger.debug(`L1 cache hit: ${key}`, { responseTime: Date.now() - startTime });
          return this.deserializeValue(l1Value);
        }
        this.stats.l1.misses++;
      }

      // Try L2 cache (Redis)
      if (this.config.l2.enabled) {
        const redis = redisClusterManager.getCluster();
        if (redis) {
          const l2Value = await redis.get(key);
          if (l2Value !== null) {
            this.stats.l2.hits++;
            
            // Promote to L1 cache
            if (this.config.l1.enabled && this.shouldPromoteToL1(key, l2Value)) {
              await this.setL1(key, l2Value, options.l1TTL);
            }

            logger.debug(`L2 cache hit: ${key}`, { responseTime: Date.now() - startTime });
            return this.deserializeValue(l2Value);
          }
          this.stats.l2.misses++;
        }
      }

      // Cache miss
      logger.debug(`Cache miss: ${key}`, { responseTime: Date.now() - startTime });
      return null;

    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    } finally {
      this.updateHitRates();
    }
  }

  /**
   * Set value in multi-level cache
   */
  async set(key, value, ttl = null, options = {}) {
    try {
      const serializedValue = this.serializeValue(value);
      const promises = [];

      // Set in L1 cache
      if (this.config.l1.enabled && this.shouldStoreInL1(key, serializedValue, options)) {
        const l1TTL = ttl || options.l1TTL || this.config.l1.defaultTTL;
        promises.push(this.setL1(key, serializedValue, l1TTL));
      }

      // Set in L2 cache
      if (this.config.l2.enabled) {
        const l2TTL = ttl || options.l2TTL || this.config.l2.defaultTTL;
        promises.push(this.setL2(key, serializedValue, l2TTL, options));
      }

      await Promise.all(promises);
      logger.debug(`Multi-level cache set: ${key}`);

    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Delete from all cache levels
   */
  async delete(key) {
    try {
      const promises = [];

      // Delete from L1
      if (this.config.l1.enabled) {
        promises.push(this.deleteL1(key));
      }

      // Delete from L2
      if (this.config.l2.enabled) {
        promises.push(this.deleteL2(key));
      }

      await Promise.all(promises);
      logger.debug(`Multi-level cache delete: ${key}`);

    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple values efficiently
   */
  async mget(keys, options = {}) {
    const result = {};
    const l2Keys = [];

    // Check L1 first
    if (this.config.l1.enabled) {
      for (const key of keys) {
        const l1Value = this.l1Cache.get(key);
        if (l1Value !== undefined) {
          result[key] = this.deserializeValue(l1Value);
          this.stats.l1.hits++;
        } else {
          l2Keys.push(key);
          this.stats.l1.misses++;
        }
      }
    } else {
      l2Keys.push(...keys);
    }

    // Check L2 for remaining keys
    if (l2Keys.length > 0 && this.config.l2.enabled) {
      try {
        const redis = redisClusterManager.getCluster();
        if (redis) {
          const l2Values = await redis.mget(...l2Keys);
          
          for (let i = 0; i < l2Keys.length; i++) {
            const key = l2Keys[i];
            const value = l2Values[i];
            
            if (value !== null) {
              result[key] = this.deserializeValue(value);
              this.stats.l2.hits++;
              
              // Promote to L1 if appropriate
              if (this.config.l1.enabled && this.shouldPromoteToL1(key, value)) {
                await this.setL1(key, value, options.l1TTL);
              }
            } else {
              this.stats.l2.misses++;
            }
          }
        }
      } catch (error) {
        logger.error('L2 cache mget error:', error);
      }
    }

    this.updateHitRates();
    return result;
  }

  /**
   * Set multiple values efficiently
   */
  async mset(keyValuePairs, ttl = null, options = {}) {
    try {
      const l1Promises = [];
      const l2Operations = [];

      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serializedValue = this.serializeValue(value);

        // Prepare L1 operations
        if (this.config.l1.enabled && this.shouldStoreInL1(key, serializedValue, options)) {
          const l1TTL = ttl || options.l1TTL || this.config.l1.defaultTTL;
          l1Promises.push(this.setL1(key, serializedValue, l1TTL));
        }

        // Prepare L2 operations
        if (this.config.l2.enabled) {
          const l2TTL = ttl || options.l2TTL || this.config.l2.defaultTTL;
          l2Operations.push([key, serializedValue, l2TTL]);
        }
      }

      // Execute L1 operations
      await Promise.all(l1Promises);

      // Execute L2 operations
      if (l2Operations.length > 0) {
        const redis = redisClusterManager.getCluster();
        if (redis) {
          const pipeline = redis.pipeline();
          for (const [key, value, ttl] of l2Operations) {
            pipeline.setex(key, ttl, value);
          }
          await pipeline.exec();
        }
      }

    } catch (error) {
      logger.error('Cache mset error:', error);
      throw error;
    }
  }

  /**
   * Invalidate cache pattern
   */
  async invalidatePattern(pattern) {
    try {
      // Invalidate L1 cache
      if (this.config.l1.enabled) {
        const l1Keys = this.l1Cache.keys();
        const keysToDelete = l1Keys.filter(key => this.matchesPattern(key, pattern));
        keysToDelete.forEach(key => this.l1Cache.del(key));
        logger.debug(`L1 pattern invalidation: ${pattern} (${keysToDelete.length} keys)`);
      }

      // Invalidate L2 cache
      if (this.config.l2.enabled) {
        const redis = redisClusterManager.getCluster();
        if (redis) {
          const keys = await redis.keys(pattern);
          if (keys.length > 0) {
            await redis.del(...keys);
            logger.debug(`L2 pattern invalidation: ${pattern} (${keys.length} keys)`);
          }
        }
      }

    } catch (error) {
      logger.error(`Cache pattern invalidation error for ${pattern}:`, error);
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics() {
    const l1Stats = this.l1Cache.getStats();
    
    return {
      l1: {
        ...this.stats.l1,
        keys: l1Stats.keys,
        hits: l1Stats.hits,
        misses: l1Stats.misses,
        hitRate: l1Stats.hits > 0 ? (l1Stats.hits / (l1Stats.hits + l1Stats.misses)) * 100 : 0,
        memoryUsage: process.memoryUsage().heapUsed
      },
      l2: {
        ...this.stats.l2,
        hitRate: this.stats.l2.hits > 0 ? (this.stats.l2.hits / (this.stats.l2.hits + this.stats.l2.misses)) * 100 : 0
      },
      total: {
        ...this.stats.total,
        overallHitRate: this.stats.total.overallHitRate
      },
      config: this.config
    };
  }

  // Private helper methods
  async setL1(key, value, ttl) {
    try {
      this.l1Cache.set(key, value, ttl);
      this.stats.l1.sets++;
    } catch (error) {
      this.stats.l1.errors++;
      throw error;
    }
  }

  async setL2(key, value, ttl, options = {}) {
    try {
      const redis = redisClusterManager.getCluster();
      if (redis) {
        // Compress large values if configured
        let finalValue = value;
        if (options.compress && value.length > this.config.l2.compressionThreshold) {
          finalValue = await this.compressValue(value);
        }

        await redis.setex(key, ttl, finalValue);
        this.stats.l2.sets++;
      }
    } catch (error) {
      this.stats.l2.errors++;
      throw error;
    }
  }

  async deleteL1(key) {
    this.l1Cache.del(key);
    this.stats.l1.deletes++;
  }

  async deleteL2(key) {
    try {
      const redis = redisClusterManager.getCluster();
      if (redis) {
        await redis.del(key);
        this.stats.l2.deletes++;
      }
    } catch (error) {
      this.stats.l2.errors++;
      throw error;
    }
  }

  shouldPromoteToL1(key, value) {
    // Don't promote large values to L1
    if (typeof value === 'string' && value.length > 10240) { // 10KB
      return false;
    }
    
    // Don't promote if L1 is near capacity
    if (this.l1Cache.keys().length >= this.config.l1.maxKeys * 0.9) {
      return false;
    }
    
    return true;
  }

  shouldStoreInL1(key, value, options = {}) {
    // Skip L1 for large values
    if (typeof value === 'string' && value.length > 51200) { // 50KB
      return false;
    }
    
    // Skip L1 if disabled in options
    if (options.l1 === false) {
      return false;
    }
    
    return true;
  }

  serializeValue(value) {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  deserializeValue(value) {
    if (typeof value !== 'string') {
      return value;
    }
    
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  matchesPattern(key, pattern) {
    // Simple glob pattern matching
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    return regex.test(key);
  }

  updateHitRates() {
    const totalL1Requests = this.stats.l1.hits + this.stats.l1.misses;
    const totalL2Requests = this.stats.l2.hits + this.stats.l2.misses;
    const totalRequests = this.stats.total.requests;

    this.stats.total.l1HitRate = totalL1Requests > 0 ? (this.stats.l1.hits / totalL1Requests) * 100 : 0;
    this.stats.total.l2HitRate = totalL2Requests > 0 ? (this.stats.l2.hits / totalL2Requests) * 100 : 0;
    this.stats.total.overallHitRate = totalRequests > 0 ? 
      ((this.stats.l1.hits + this.stats.l2.hits) / totalRequests) * 100 : 0;
  }

  setupMetricsCollection() {
    if (this.config.enableMetrics) {
      setInterval(() => {
        const stats = this.getCacheStatistics();
        logger.debug('Cache metrics', stats);
      }, 60000); // Every minute
    }
  }

  async compressValue(value) {
    // Implement compression logic (e.g., using zlib)
    // For now, return as-is
    return value;
  }
}

// Export singleton instance
export const multiLevelCacheManager = new MultiLevelCacheManager();
