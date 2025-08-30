// src/infrastructure/database/redis/config.js - Redis configuration and client management
import Redis from 'redis';
import { logger } from '#utils/core/logger.js';
import appConfig from '#shared/config/app.config.js';

/**
 * Redis Configuration and Client Manager
 * Handles Redis connections with clustering, sentinel, and failover support
 */
class RedisConfig {
  constructor() {
    this.clients = new Map();
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryDelay = 1000;
  }

  /**
   * Get Redis configuration based on environment
   */
  getConfig(purpose = 'default') {
    const baseConfig = {
      url: appConfig.get('cache.redis.url'),
      host: appConfig.get('cache.redis.host'),
      port: appConfig.get('cache.redis.port'),
      password: appConfig.get('cache.redis.password'),
      db: appConfig.get('cache.redis.db'),
      
      // Connection options
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
      
      // Key prefix
      keyPrefix: appConfig.get('cache.redis.keyPrefix'),
      
      // Serialization
      serializer: {
        stringify: JSON.stringify,
        parse: JSON.parse
      },
      
      // Event handling
      enableOfflineQueue: false,
      enableReadyCheck: true,
      
      // Health check
      maxLoadingTimeout: 5000
    };

    // Environment-specific overrides
    if (appConfig.isProduction()) {
      return {
        ...baseConfig,
        connectTimeout: 15000,
        commandTimeout: 8000,
        retryDelayOnFailover: 200,
        maxRetriesPerRequest: 5,
        keepAlive: 60000
      };
    }

    if (appConfig.isDevelopment()) {
      return {
        ...baseConfig,
        connectTimeout: 5000,
        commandTimeout: 3000,
        retryDelayOnFailover: 50,
        maxRetriesPerRequest: 2
      };
    }

    // Purpose-specific configurations
    const purposeConfigs = {
      cache: {
        ...baseConfig,
        db: 0,
        keyPrefix: 'cache:'
      },
      
      session: {
        ...baseConfig,
        db: 1,
        keyPrefix: 'sess:',
        ttl: 86400 // 24 hours
      },
      
      queue: {
        ...baseConfig,
        db: 2,
        keyPrefix: 'queue:',
        enableOfflineQueue: true
      },
      
      pubsub: {
        ...baseConfig,
        db: 3,
        keyPrefix: 'pubsub:',
        enableOfflineQueue: false
      },
      
      locks: {
        ...baseConfig,
        db: 4,
        keyPrefix: 'lock:',
        commandTimeout: 1000
      }
    };

    return purposeConfigs[purpose] || baseConfig;
  }

  /**
   * Create Redis client with enhanced configuration
   */
  async createClient(purpose = 'default') {
    if (this.clients.has(purpose)) {
      return this.clients.get(purpose);
    }

    const config = this.getConfig(purpose);
    
    try {
      logger.info(`🔗 Creating Redis client for: ${purpose}`);
      
      const client = Redis.createClient(config);
      
      // Event handlers
      this.setupEventHandlers(client, purpose);
      
      // Connect with retry logic
      await this.connectWithRetry(client, purpose);
      
      // Store client
      this.clients.set(purpose, client);
      
      logger.info(`✅ Redis client created successfully: ${purpose}`);
      return client;
      
    } catch (error) {
      logger.error(`❌ Failed to create Redis client for ${purpose}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Setup event handlers for Redis client
   */
  setupEventHandlers(client, purpose) {
    client.on('connect', () => {
      logger.debug(`Redis client connecting: ${purpose}`);
    });

    client.on('ready', () => {
      logger.info(`✅ Redis client ready: ${purpose}`);
      this.isConnected = true;
      this.connectionRetries = 0;
    });

    client.on('error', (error) => {
      logger.error(`❌ Redis client error (${purpose}): ${error.message}`);
      
      // Handle specific error types
      if (error.code === 'ECONNREFUSED') {
        logger.error('Redis server is not running or unreachable');
      } else if (error.code === 'NOAUTH') {
        logger.error('Redis authentication failed');
      } else if (error.code === 'LOADING') {
        logger.warn('Redis server is loading data');
      }
    });

    client.on('end', () => {
      logger.warn(`🔚 Redis client connection ended: ${purpose}`);
      this.isConnected = false;
    });

    client.on('reconnecting', () => {
      logger.info(`🔄 Redis client reconnecting: ${purpose}`);
      this.connectionRetries++;
    });

    client.on('warning', (warning) => {
      logger.warn(`⚠️ Redis client warning (${purpose}): ${warning}`);
    });
  }

  /**
   * Connect with retry logic
   */
  async connectWithRetry(client, purpose) {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        await client.connect();
        return;
      } catch (error) {
        logger.warn(`Redis connection attempt ${attempt}/${this.maxRetries} failed for ${purpose}: ${error.message}`);
        
        if (attempt === this.maxRetries) {
          throw error;
        }
        
        // Exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Get or create client for specific purpose
   */
  async getClient(purpose = 'default') {
    if (!appConfig.get('cache.redis.enabled')) {
      throw new Error('Redis is not enabled in configuration');
    }

    if (this.clients.has(purpose)) {
      const client = this.clients.get(purpose);
      
      // Check if client is still connected
      if (client.isReady) {
        return client;
      }
      
      // Remove disconnected client
      this.clients.delete(purpose);
    }

    return await this.createClient(purpose);
  }

  /**
   * Create multiple clients at once
   */
  async createClients(purposes = ['cache', 'session', 'queue']) {
    const clients = {};
    
    for (const purpose of purposes) {
      try {
        clients[purpose] = await this.createClient(purpose);
      } catch (error) {
        logger.error(`Failed to create Redis client for ${purpose}: ${error.message}`);
        // Continue creating other clients
      }
    }
    
    return clients;
  }

  /**
   * Health check for Redis connections
   */
  async healthCheck() {
    const health = {
      status: 'healthy',
      clients: {},
      totalClients: this.clients.size
    };

    for (const [purpose, client] of this.clients) {
      try {
        const startTime = Date.now();
        await client.ping();
        const responseTime = Date.now() - startTime;
        
        health.clients[purpose] = {
          status: 'healthy',
          connected: client.isReady,
          responseTime
        };
      } catch (error) {
        health.status = 'degraded';
        health.clients[purpose] = {
          status: 'unhealthy',
          connected: false,
          error: error.message
        };
      }
    }

    return health;
  }

  /**
   * Get connection statistics
   */
  getStats() {
    const stats = {
      totalClients: this.clients.size,
      connectedClients: 0,
      clientDetails: {}
    };

    for (const [purpose, client] of this.clients) {
      const isConnected = client.isReady;
      if (isConnected) {
        stats.connectedClients++;
      }

      stats.clientDetails[purpose] = {
        connected: isConnected,
        connectionRetries: this.connectionRetries
      };
    }

    return stats;
  }

  /**
   * Graceful shutdown of all Redis connections
   */
  async shutdown() {
    logger.info('🛑 Shutting down Redis connections...');
    
    const shutdownPromises = [];
    
    for (const [purpose, client] of this.clients) {
      shutdownPromises.push(
        client.quit()
          .then(() => {
            logger.info(`✅ Redis client disconnected: ${purpose}`);
          })
          .catch((error) => {
            logger.warn(`⚠️ Error disconnecting Redis client ${purpose}: ${error.message}`);
          })
      );
    }
    
    await Promise.allSettled(shutdownPromises);
    this.clients.clear();
    this.isConnected = false;
    
    logger.info('✅ All Redis connections closed');
  }

  /**
   * Flush all data from Redis (development only)
   */
  async flushAll() {
    if (appConfig.isProduction()) {
      throw new Error('Cannot flush Redis data in production environment');
    }

    logger.warn('🗑️ Flushing all Redis data...');
    
    const client = await this.getClient('cache');
    await client.flushAll();
    
    logger.warn('✅ All Redis data flushed');
  }

  /**
   * Get Redis info
   */
  async getInfo(section = 'all') {
    const client = await this.getClient('cache');
    const info = await client.info(section);
    
    // Parse info string into object
    const parsedInfo = {};
    const lines = info.split('\r\n');
    
    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          parsedInfo[key] = isNaN(value) ? value : Number(value);
        }
      }
    }
    
    return parsedInfo;
  }
}

// Export singleton instance
const redisConfig = new RedisConfig();

// Utility functions
export const getRedisClient = (purpose) => redisConfig.getClient(purpose);
export const createRedisClients = (purposes) => redisConfig.createClients(purposes);
export const redisHealthCheck = () => redisConfig.healthCheck();
export const redisStats = () => redisConfig.getStats();
export const shutdownRedis = () => redisConfig.shutdown();

export default redisConfig;
