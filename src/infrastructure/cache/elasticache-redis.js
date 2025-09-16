// src/infrastructure/cache/elasticache-redis.js
import Redis from 'ioredis';
import { logger } from '#utils/core/logger.js';
import appConfig from '#shared/config/app.config.js';

class ElastiCacheRedisClient {
  constructor() {
    this.client = null;
    this.clusterClient = null;
    this.isConnected = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async initialize() {
    try {
      const redisConfig = appConfig.get('cache.redis');
      
      if (redisConfig.cluster?.enabled) {
        await this.initializeCluster();
      } else {
        await this.initializeSingleNode();
      }

      this.setupEventHandlers();
      this.isConnected = true;
      
      logger.info('✅ ElastiCache Redis initialized successfully');
      return this.client || this.clusterClient;
    } catch (error) {
      logger.error(`❌ ElastiCache Redis initialization failed: ${error.message}`);
      throw error;
    }
  }

  async initializeSingleNode() {
    const config = {
      host: process.env.ELASTICACHE_ENDPOINT,
      port: parseInt(process.env.ELASTICACHE_PORT) || 6379,
      password: process.env.ELASTICACHE_AUTH_TOKEN,
      
      // ElastiCache optimized settings
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      
      // Connection pooling
      lazyConnect: true,
      keepAlive: true,
      family: 4,
      
      // TLS for ElastiCache in-transit encryption
      tls: process.env.ELASTICACHE_TLS_ENABLED === 'true' ? {
        checkServerIdentity: () => undefined // ElastiCache uses self-signed certs
      } : null,
      
      // ElastiCache specific options
      enableReadyCheck: true,
      maxLoadingTimeout: 5000,
      
      // Retry logic
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`ElastiCache retry attempt ${times}, delay: ${delay}ms`);
        return delay;
      }
    };

    this.client = new Redis(config);
  }

  async initializeCluster() {
    const clusterEndpoints = process.env.ELASTICACHE_CLUSTER_ENDPOINTS?.split(',') || [];
    
    const clusterConfig = {
      enableOfflineQueue: false,
      redisOptions: {
        password: process.env.ELASTICACHE_AUTH_TOKEN,
        connectTimeout: 10000,
        commandTimeout: 5000,
        tls: process.env.ELASTICACHE_TLS_ENABLED === 'true' ? {
          checkServerIdentity: () => undefined
        } : null
      },
      
      // Cluster specific settings
      scaleReads: 'slave',
      maxRedirections: 16,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      redisOptions: {
        keepAlive: true,
        family: 4
      }
    };

    this.clusterClient = new Redis.Cluster(
      clusterEndpoints.map(endpoint => {
        const [host, port] = endpoint.split(':');
        return { host, port: parseInt(port) || 6379 };
      }),
      clusterConfig
    );
  }

  setupEventHandlers() {
    const client = this.client || this.clusterClient;
    
    client.on('connect', () => {
      logger.info('🔗 ElastiCache Redis connected');
      this.isConnected = true;
      this.connectionRetries = 0;
    });

    client.on('ready', () => {
      logger.info('✅ ElastiCache Redis ready for operations');
    });

    client.on('error', (error) => {
      logger.error(`❌ ElastiCache Redis error: ${error.message}`);
      this.isConnected = false;
    });

    client.on('close', () => {
      logger.warn('🔚 ElastiCache Redis connection closed');
      this.isConnected = false;
    });

    client.on('reconnecting', () => {
      this.connectionRetries++;
      logger.info(`🔄 ElastiCache Redis reconnecting (attempt: ${this.connectionRetries})`);
    });
  }

  getClient() {
    return this.client || this.clusterClient;
  }

  async healthCheck() {
    try {
      const client = this.getClient();
      const startTime = Date.now();
      
      await client.ping();
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        isConnected: this.isConnected,
        cluster: !!this.clusterClient,
        endpoint: process.env.ELASTICACHE_ENDPOINT
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        isConnected: false
      };
    }
  }

  async shutdown() {
    try {
      const client = this.getClient();
      if (client) {
        await client.quit();
        logger.info('✅ ElastiCache Redis connection closed gracefully');
      }
    } catch (error) {
      logger.error(`Error closing ElastiCache connection: ${error.message}`);
    }
  }
}

export default new ElastiCacheRedisClient();
