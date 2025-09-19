// src/infrastructure/cache/unified-caching-service.js
import { redisClusterManager } from "./redis/redis-cluster-manager.js";
import { cacheWarmingService } from "./warming/cache-warming-service.js";
import { multiLevelCacheManager } from "./multi-level/multi-level-cache-manager.js";
import { cacheInvalidationManager } from "./invalidation/cache-invalidation-manager.js";
import { cdnIntegrationManager } from "./cdn/cdn-integration-manager.js";
import { logger } from "#utils/core/logger.js";

/**
 * Unified Caching Service
 * Orchestrates all caching strategies and components
 */
export class UnifiedCachingService {
  constructor() {
    this.components = {
      redisCluster: redisClusterManager,
      cacheWarming: cacheWarmingService,
      multiLevel: multiLevelCacheManager,
      invalidation: cacheInvalidationManager,
      cdn: cdnIntegrationManager
    };
  }

  /**
   * Initialize complete caching system
   */
  async initializeCachingSystem(config = {}) {
    try {
      logger.info('Initializing unified caching system');

      // Initialize Redis cluster
      await this.initializeRedisCluster(config.redis);

      // Setup cache invalidation rules
      this.setupInvalidationRules();

      // Start cache warming service
      this.startCacheWarming();

      // Setup CDN integration
      await this.setupCDNIntegration(config.cdn);

      // Start monitoring
      this.startCacheMonitoring();

      logger.info('Unified caching system initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize caching system:', error);
      throw error;
    }
  }

  /**
   * Initialize Redis cluster
   */
  async initializeRedisCluster(config = {}) {
    const nodes = config.nodes || [
      { host: process.env.REDIS_HOST_1 || 'localhost', port: 7001 },
      { host: process.env.REDIS_HOST_2 || 'localhost', port: 7002 },
      { host: process.env.REDIS_HOST_3 || 'localhost', port: 7003 }
    ];

    await redisClusterManager.initializeCluster('default', nodes, config.options);
    redisClusterManager.startHealthMonitoring();
  }

  /**
   * Setup invalidation rules
   */
  setupInvalidationRules() {
    cacheInvalidationManager.setupERPInvalidationRules();
  }

  /**
   * Start cache warming
   */
  startCacheWarming() {
    cacheWarmingService.startWarmingService();
  }

  /**
   * Setup CDN integration
   */
  async setupCDNIntegration(config = {}) {
    await cdnIntegrationManager.setupCachingRules();
  }

  /**
   * Start cache monitoring
   */
  startCacheMonitoring() {
    setInterval(() => {
      this.collectCacheMetrics();
    }, 60000); // Every minute
  }

  /**
   * Get comprehensive cache statistics
   */
  async getCacheStatistics() {
    const stats = {
      timestamp: new Date(),
      redis: await redisClusterManager.getClusterStatistics(),
      multiLevel: multiLevelCacheManager.getCacheStatistics(),
      warming: cacheWarmingService.getWarmingStatistics(),
      invalidation: cacheInvalidationManager.getInvalidationStatistics(),
      cdn: await cdnIntegrationManager.getCDNMetrics(
        new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        new Date()
      )
    };

    return stats;
  }

  /**
   * Collect cache metrics
   */
  async collectCacheMetrics() {
    try {
      const stats = await this.getCacheStatistics();
      logger.debug('Cache metrics collected', {
        redisHealthy: stats.redis.summary.healthyClusters,
        l1HitRate: stats.multiLevel.total.l1HitRate,
        l2HitRate: stats.multiLevel.total.l2HitRate,
        cdnHitRate: stats.cdn.cacheHitRatio
      });
    } catch (error) {
      logger.error('Failed to collect cache metrics:', error);
    }
  }
}

// Export singleton instance
export const unifiedCachingService = new UnifiedCachingService();
