// src/core/cache/services/unified-cache.service.js - FIXED VERSION
import NodeCache from "node-cache";
import { logger } from "#utils/core/logger.js";
import { BusinessException } from "#shared/exceptions/business.exception.js";

/**
 * @description FIXED Unified Cache Service with proper configuration handling
 * Removed the static initialization that was causing undefined config access
 */
class CacheService {
  static #instance = null;
  #nodeCache = null;
  #redisClient = null;
  #config = null;
  #isInitialized = false;

  /**
   * @description Private constructor
   * @private
   */
  constructor() {
    if (CacheService.#instance) {
      return CacheService.#instance;
    }
    CacheService.#instance = this;
  }

  /**
   * @description Gets singleton instance
   * @returns {CacheService}
   */
  static getInstance() {
    if (!CacheService.#instance) {
      CacheService.#instance = new CacheService();
    }
    return CacheService.#instance;
  }

  /**
   * @description FIXED Initialize cache with configuration
   * @param {Object} config - Configuration object
   * @returns {Promise<void>}
   */
  static async initialize(config) {
    const instance = CacheService.getInstance();

    if (instance.#isInitialized) {
      logger.debug("Cache service already initialized");
      return;
    }

    try {
      // FIXED: Validate and set default configuration
      instance.#config = {
        ttl: config?.cache?.ttl || 600,
        checkperiod: config?.cache?.checkperiod || 60,
        maxKeys: config?.cache?.maxKeys || 10000,
        redisUrl: config?.redis?.url || null,
      };

      logger.debug("Initializing cache service with config:", {
        ttl: instance.#config.ttl,
        checkperiod: instance.#config.checkperiod,
        maxKeys: instance.#config.maxKeys,
        redisEnabled: !!instance.#config.redisUrl,
      });

      // Initialize NodeCache (in-memory)
      instance.#nodeCache = new NodeCache({
        stdTTL: instance.#config.ttl,
        checkperiod: instance.#config.checkperiod,
        maxKeys: instance.#config.maxKeys,
        useClones: false, // Better performance
        deleteOnExpire: true,
        enableLegacyCallbacks: false,
      });

      // Setup NodeCache event handlers
      instance.#nodeCache.on("set", (key) => {
        logger.debug(`Cache SET: ${key}`);
      });

      instance.#nodeCache.on("del", (key) => {
        logger.debug(`Cache DEL: ${key}`);
      });

      instance.#nodeCache.on("expired", (key) => {
        logger.debug(`Cache EXPIRED: ${key}`);
      });


      // FIXED: Optional Redis initialization with error handling
      if (instance.#config.redisUrl) {
        try {
          await instance.#initializeRedis(instance.#config.redisUrl);
        } catch (redisError) {
          logger.warn(
            "Redis initialization failed, falling back to memory cache only",
            {
              error: redisError.message,
            },
          );
          // Don't throw error - continue with memory cache only
        }
      }

      instance.#isInitialized = true;
      logger.info("Cache service initialized successfully", {
        memoryCache: true,
        redisCache: !!instance.#redisClient,
        ttl: instance.#config.ttl,
      });
    } catch (error) {
      logger.error("Cache service initialization failed:", error);
      throw new BusinessException(
        `Cache initialization failed: ${error.message}`,
      );
    }
  }

  /**
   * @description Initialize Redis connection
   * @param {string} redisUrl - Redis URL
   * @returns {Promise<void>}
   * @private
   */
  async #initializeRedis(redisUrl) {
    try {
      // Dynamic Redis import to avoid dependency issues
      const { createClient } = await import("redis");

      this.#redisClient = createClient({
        url: redisUrl,
        socket: {
          connectTimeout: 5000,
          lazyConnect: true,
        },
        retryDelayOnFailover: 100,
        retryDelayOnClusterDown: 100,
        maxRetriesPerRequest: 3,
      });

      this.#redisClient.on("error", (error) => {
        logger.error("Redis client error:", error);
      });

      this.#redisClient.on("connect", () => {
        logger.debug("Redis client connected");
      });

      this.#redisClient.on("ready", () => {
        logger.info("Redis client ready");
      });

      this.#redisClient.on("end", () => {
        logger.warn("Redis client connection ended");
      });

      await this.#redisClient.connect();

      // Test Redis connection
      await this.#redisClient.ping();

      logger.info("Redis cache initialized successfully");
    } catch (error) {
      logger.error("Redis initialization error:", error);
      this.#redisClient = null;
      throw error;
    }
  }

  /**
   * @description Get value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any|null>} Cached value or null
   */
  async get(key) {
    this.#ensureInitialized();

    try {
      // Try Redis first if available
      if (this.#redisClient) {
        try {
          const redisValue = await this.#redisClient.get(key);
          if (redisValue !== null) {
            logger.debug(`Cache HIT (Redis): ${key}`);
            return JSON.parse(redisValue);
          }
        } catch (redisError) {
          logger.warn(`Redis GET error for key ${key}:`, redisError.message);
        }
      }

      // Fall back to memory cache
      const memoryValue = this.#nodeCache.get(key);
      if (memoryValue !== undefined) {
        logger.debug(`Cache HIT (Memory): ${key}`);
        return memoryValue;
      }

      logger.debug(`Cache MISS: ${key}`);
      return null;
    } catch (error) {
      logger.error(`Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * @description Set value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} [ttl] - Time to live in seconds
   * @returns {Promise<boolean>} True if successful
   */
  async set(key, value, ttl) {
    this.#ensureInitialized();

    const effectiveTtl = ttl || this.#config.ttl;

    try {
      // Set in memory cache first
      const memoryResult = this.#nodeCache.set(key, value, effectiveTtl);

      // Set in Redis if available
      if (this.#redisClient) {
        try {
          await this.#redisClient.setEx(
            key,
            effectiveTtl,
            JSON.stringify(value),
          );
        } catch (redisError) {
          logger.warn(`Redis SET error for key ${key}:`, redisError.message);
        }
      }

      if (memoryResult) {
        logger.debug(`Cache SET: ${key} (TTL: ${effectiveTtl}s)`);
      }

      return memoryResult;
    } catch (error) {
      logger.error(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * @description Delete value from cache
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if successful
   */
  async del(key) {
    this.#ensureInitialized();

    try {
      // Delete from memory cache
      const memoryDeleted = this.#nodeCache.del(key) > 0;

      // Delete from Redis if available
      if (this.#redisClient) {
        try {
          await this.#redisClient.del(key);
        } catch (redisError) {
          logger.warn(`Redis DEL error for key ${key}:`, redisError.message);
        }
      }

      if (memoryDeleted) {
        logger.debug(`Cache DEL: ${key}`);
      }

      return memoryDeleted;
    } catch (error) {
      logger.error(`Cache DEL error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * @description Clear all cache
   * @returns {Promise<boolean>} True if successful
   */
  async clear() {
    this.#ensureInitialized();

    try {
      // Clear memory cache
      this.#nodeCache.flushAll();

      // Clear Redis if available
      if (this.#redisClient) {
        try {
          await this.#redisClient.flushAll();
        } catch (redisError) {
          logger.warn("Redis FLUSH error:", redisError.message);
        }
      }

      logger.info("Cache cleared successfully");
      return true;
    } catch (error) {
      logger.error("Cache CLEAR error:", error);
      return false;
    }
  }

  /**
   * @description Get cache statistics
   * @returns {Promise<Object>} Cache statistics
   */
  async getStats() {
    this.#ensureInitialized();

    try {
      const memoryStats = this.#nodeCache.getStats();
      const stats = {
        memory: {
          keys: memoryStats.keys,
          hits: memoryStats.hits,
          misses: memoryStats.misses,
          ksize: memoryStats.ksize,
          vsize: memoryStats.vsize,
        },
        redis: null,
        config: {
          ttl: this.#config.ttl,
          maxKeys: this.#config.maxKeys,
          redisEnabled: !!this.#redisClient,
        },
      };

      // Get Redis stats if available
      if (this.#redisClient) {
        try {
          const redisInfo = await this.#redisClient.info("stats");
          stats.redis = { info: redisInfo };
        } catch (redisError) {
          logger.warn("Redis STATS error:", redisError.message);
        }
      }

      return stats;
    } catch (error) {
      logger.error("Cache STATS error:", error);
      return { error: error.message };
    }
  }

  /**
   * @description Check if cache exists for key
   * @param {string} key - Cache key
   * @returns {Promise<boolean>} True if key exists
   */
  async has(key) {
    this.#ensureInitialized();

    try {
      // Check Redis first
      if (this.#redisClient) {
        try {
          const exists = await this.#redisClient.exists(key);
          if (exists) {
            return true;
          }
        } catch (redisError) {
          logger.warn(`Redis EXISTS error for key ${key}:`, redisError.message);
        }
      }

      // Check memory cache
      return this.#nodeCache.has(key);
    } catch (error) {
      logger.error(`Cache HAS error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * @description Get or set pattern - get from cache or compute and set
   * @param {string} key - Cache key
   * @param {Function} computeFn - Function to compute value if not in cache
   * @param {number} [ttl] - Time to live in seconds
   * @returns {Promise<any>} Cached or computed value
   */
  async getOrSet(key, computeFn, ttl) {
    this.#ensureInitialized();

    try {
      // Try to get from cache first
      const cachedValue = await this.get(key);
      if (cachedValue !== null) {
        return cachedValue;
      }

      // Compute value
      const computedValue = await computeFn();

      // Set in cache
      await this.set(key, computedValue, ttl);

      return computedValue;
    } catch (error) {
      logger.error(`Cache GET_OR_SET error for key ${key}:`, error);
      // Return computed value even if caching fails
      try {
        return await computeFn();
      } catch (computeError) {
        logger.error(`Compute function error for key ${key}:`, computeError);
        throw computeError;
      }
    }
  }

  /**
   * @description Shutdown cache service
   * @returns {Promise<void>}
   */
  async shutdown() {
    try {
      if (this.#nodeCache) {
        this.#nodeCache.close();
      }

      if (this.#redisClient) {
        await this.#redisClient.quit();
      }

      this.#isInitialized = false;
      logger.info("Cache service shutdown completed");
    } catch (error) {
      logger.error("Cache shutdown error:", error);
    }
  }

  /**
   * @description Ensure cache is initialized
   * @private
   */
  #ensureInitialized() {
    if (!this.#isInitialized) {
      throw new BusinessException(
        "Cache service not initialized. Call CacheService.initialize() first.",
      );
    }
  }

  /**
   * @description Get cache configuration
   * @returns {Object|null} Cache configuration
   */
  getConfig() {
    return this.#config;
  }

  /**
   * @description Check if cache is initialized
   * @returns {boolean} True if initialized
   */
  isInitialized() {
    return this.#isInitialized;
  }
}

// FIXED: Export the service instance - no static initialization
export { CacheService };
export default CacheService;
