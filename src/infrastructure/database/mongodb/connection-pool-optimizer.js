// src/infrastructure/database/mongodb/connection-pool-optimizer.js
import mongoose from "mongoose";
import { logger } from "#utils/core/logger.js";
import { CacheService } from "#core/cache/services/unified-cache.service.js";
import { EventEmitter } from "events";
import os from "os";

/**
 * Advanced Connection Pool Optimizer
 * Dynamically manages connection pools based on load and tenant usage
 */
export class ConnectionPoolOptimizer extends EventEmitter {
  constructor() {
    super();
    this.pools = new Map(); // tenant -> pool info
    this.poolMetrics = new Map(); // tenant -> metrics
    this.optimizationRules = new Map();
    this.monitoringInterval = null;
    this.optimizationInterval = null;
    this.initializeOptimizationRules();
  }

  /**
   * Initialize connection pool optimization rules
   */
  initializeOptimizationRules() {
    // High traffic tenant rule
    this.optimizationRules.set('HIGH_TRAFFIC', {
      condition: (metrics) => metrics.avgConcurrentConnections > 50,
      adjustments: {
        maxPoolSize: 50,
        minPoolSize: 10,
        maxIdleTimeMS: 60000,
        serverSelectionTimeoutMS: 5000
      },
      priority: 1
    });

    // Low traffic tenant rule
    this.optimizationRules.set('LOW_TRAFFIC', {
      condition: (metrics) => metrics.avgConcurrentConnections < 5,
      adjustments: {
        maxPoolSize: 5,
        minPoolSize: 1,
        maxIdleTimeMS: 300000,
        serverSelectionTimeoutMS: 15000
      },
      priority: 2
    });

    // Peak hours rule
    this.optimizationRules.set('PEAK_HOURS', {
      condition: (metrics) => this.isPeakHour() && metrics.requestsPerMinute > 100,
      adjustments: {
        maxPoolSize: (current) => Math.min(current * 1.5, 100),
        minPoolSize: (current) => Math.max(current, 5)
      },
      priority: 3
    });

    // Resource constrained rule
    this.optimizationRules.set('RESOURCE_CONSTRAINED', {
      condition: (metrics) => this.getSystemMemoryUsage() > 0.8,
      adjustments: {
        maxPoolSize: (current) => Math.max(current * 0.7, 3),
        minPoolSize: 1
      },
      priority: 4
    });
  }

  /**
   * Create optimized connection pool for tenant
   */
  async createOptimizedPool(tenantId, baseConfig) {
    try {
      const optimizedConfig = await this.calculateOptimalPoolConfig(tenantId, baseConfig);
      
      const pool = {
        tenantId,
        connection: null,
        config: optimizedConfig,
        createdAt: new Date(),
        lastOptimized: new Date(),
        metrics: this.initializePoolMetrics()
      };

      // Create connection with optimized settings
      pool.connection = await this.createConnectionWithConfig(optimizedConfig);
      
      // Setup monitoring for this pool
      this.setupPoolMonitoring(tenantId, pool);
      
      this.pools.set(tenantId, pool);
      this.poolMetrics.set(tenantId, pool.metrics);

      logger.info(`Optimized connection pool created for tenant: ${tenantId}`, {
        maxPoolSize: optimizedConfig.maxPoolSize,
        minPoolSize: optimizedConfig.minPoolSize,
        optimization: optimizedConfig.optimizationProfile
      });

      return pool;

    } catch (error) {
      logger.error(`Failed to create optimized pool for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Calculate optimal pool configuration based on tenant usage patterns
   */
  async calculateOptimalPoolConfig(tenantId, baseConfig) {
    const historicalMetrics = await this.getHistoricalMetrics(tenantId);
    const currentLoad = await this.getCurrentSystemLoad();
    const tenantProfile = await this.getTenantProfile(tenantId);

    // Base configuration
    let config = {
      uri: baseConfig.uri,
      maxPoolSize: this.calculateOptimalMaxPoolSize(tenantProfile, historicalMetrics),
      minPoolSize: this.calculateOptimalMinPoolSize(tenantProfile, historicalMetrics),
      maxIdleTimeMS: this.calculateOptimalIdleTime(tenantProfile),
      serverSelectionTimeoutMS: this.calculateOptimalServerSelectionTimeout(tenantProfile),
      socketTimeoutMS: this.calculateOptimalSocketTimeout(tenantProfile),
      connectTimeoutMS: 10000,
      heartbeatFrequencyMS: this.calculateOptimalHeartbeatFrequency(tenantProfile),
      
      // Advanced optimizations
      retryWrites: true,
      retryReads: true,
      readPreference: tenantProfile.readHeavy ? 'secondaryPreferred' : 'primaryPreferred',
      readConcern: { level: tenantProfile.consistencyRequired ? 'majority' : 'local' },
      writeConcern: { 
        w: tenantProfile.highAvailability ? 'majority' : 1,
        j: tenantProfile.durabilityRequired,
        wtimeout: 5000
      },

      // Buffer management
      bufferCommands: false, // Disable for better error handling
      bufferMaxEntries: 0,

      // Compression for large data transfers
      compressors: tenantProfile.largeDocuments ? ['zstd', 'zlib'] : undefined,
      zlibCompressionLevel: 6,

      // Application identification
      appName: `school-erp-${process.env.NODE_ENV}-${tenantId}`,
      
      // Monitoring
      monitorCommands: true,
      serverApi: {
        version: '1',
        strict: false,
        deprecationErrors: false
      }
    };

    // Apply optimization rules
    config = this.applyOptimizationRules(config, historicalMetrics, currentLoad);
    
    // Add optimization profile for tracking
    config.optimizationProfile = this.determineOptimizationProfile(historicalMetrics, currentLoad);

    return config;
  }

  /**
   * Calculate optimal max pool size based on tenant characteristics
   */
  calculateOptimalMaxPoolSize(tenantProfile, metrics) {
    const baseConcurrency = tenantProfile.expectedConcurrentUsers || 10;
    const peakMultiplier = metrics.peakToAverageRatio || 2;
    const systemCores = os.cpus().length;
    
    // Formula: base concurrent users * peak multiplier * connections per user
    // Capped by system resources
    const calculated = Math.min(
      baseConcurrency * peakMultiplier * 0.8, // 0.8 connections per concurrent user
      systemCores * 4, // Max 4 connections per CPU core
      100 // Absolute maximum
    );

    return Math.max(calculated, 3); // Minimum 3 connections
  }

  /**
   * Calculate optimal min pool size
   */
  calculateOptimalMinPoolSize(tenantProfile, metrics) {
    const baseUsers = tenantProfile.expectedConcurrentUsers || 10;
    const calculated = Math.max(
      Math.ceil(baseUsers * 0.1), // 10% of expected concurrent users
      1 // Minimum 1 connection
    );

    return Math.min(calculated, 5); // Maximum 5 minimum connections
  }

  /**
   * Calculate optimal idle timeout based on usage patterns
   */
  calculateOptimalIdleTime(tenantProfile) {
    if (tenantProfile.continuousUsage) {
      return 600000; // 10 minutes for continuous usage
    } else if (tenantProfile.burstTraffic) {
      return 180000; // 3 minutes for burst traffic
    } else {
      return 300000; // 5 minutes default
    }
  }

  /**
   * Monitor pool performance and adjust dynamically
   */
  setupPoolMonitoring(tenantId, pool) {
    const connection = pool.connection;
    
    // Connection event monitoring
    connection.on('connected', () => {
      this.updatePoolMetrics(tenantId, 'connections', 1);
    });

    connection.on('disconnected', () => {
      this.updatePoolMetrics(tenantId, 'disconnections', 1);
    });

    connection.on('error', (error) => {
      this.updatePoolMetrics(tenantId, 'errors', 1);
      logger.warn(`Pool error for tenant ${tenantId}:`, error.message);
    });

    // Command monitoring for performance analysis
    connection.on('commandStarted', (event) => {
      this.trackCommandStart(tenantId, event);
    });

    connection.on('commandSucceeded', (event) => {
      this.trackCommandSuccess(tenantId, event);
    });

    connection.on('commandFailed', (event) => {
      this.trackCommandFailure(tenantId, event);
    });

    // Pool-specific monitoring
    setInterval(() => {
      this.collectPoolStats(tenantId, pool);
    }, 30000); // Every 30 seconds
  }

  /**
   * Collect detailed pool statistics
   */
  collectPoolStats(tenantId, pool) {
    try {
      const connection = pool.connection;
      const db = connection.db;
      
      // Get connection pool stats if available
      const poolStats = {
        currentConnectionCount: connection.readyState === 1 ? 1 : 0,
        totalConnectionsCreated: this.poolMetrics.get(tenantId)?.totalConnections || 0,
        totalConnectionsClosed: this.poolMetrics.get(tenantId)?.totalDisconnections || 0,
        currentlyInUse: connection.readyState === 1 ? 1 : 0,
        availableConnections: connection.readyState === 1 ? pool.config.maxPoolSize - 1 : 0
      };

      this.updatePoolMetrics(tenantId, 'poolStats', poolStats);
      
      // Emit metrics for monitoring systems
      this.emit('poolStats', {
        tenantId,
        stats: poolStats,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error(`Error collecting pool stats for tenant ${tenantId}:`, error);
    }
  }

  /**
   * Dynamic pool optimization based on current metrics
   */
  async optimizePoolDynamically(tenantId) {
    try {
      const pool = this.pools.get(tenantId);
      const metrics = this.poolMetrics.get(tenantId);

      if (!pool || !metrics) return;

      // Calculate new optimal configuration
      const currentProfile = await this.getTenantProfile(tenantId);
      const newConfig = await this.calculateOptimalPoolConfig(tenantId, pool.config);

      // Check if optimization is needed
      if (this.shouldOptimizePool(pool.config, newConfig, metrics)) {
        logger.info(`Optimizing pool for tenant ${tenantId}`);
        
        // Create new optimized connection
        const newConnection = await this.createConnectionWithConfig(newConfig);
        
        // Gracefully replace the old connection
        await this.replacePoolConnection(tenantId, newConnection, newConfig);
        
        pool.lastOptimized = new Date();
        
        logger.info(`Pool optimized for tenant ${tenantId}`, {
          oldMaxPool: pool.config.maxPoolSize,
          newMaxPool: newConfig.maxPoolSize,
          oldMinPool: pool.config.minPoolSize,
          newMinPool: newConfig.minPoolSize
        });
      }

    } catch (error) {
      logger.error(`Pool optimization failed for tenant ${tenantId}:`, error);
    }
  }

  /**
   * Create connection with specific configuration
   */
  async createConnectionWithConfig(config) {
    const { uri, ...mongooseOptions } = config;
    return await mongoose.createConnection(uri, mongooseOptions);
  }

  /**
   * Start continuous optimization monitoring
   */
  startOptimizationMonitoring() {
    // Monitor pool metrics every minute
    this.monitoringInterval = setInterval(() => {
      this.collectAllPoolMetrics();
    }, 60000);

    // Optimize pools every 5 minutes
    this.optimizationInterval = setInterval(() => {
      this.optimizeAllPools();
    }, 300000);

    logger.info('Connection pool optimization monitoring started');
  }

  /**
   * Stop optimization monitoring
   */
  stopOptimizationMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    if (this.optimizationInterval) {
      clearInterval(this.optimizationInterval);
      this.optimizationInterval = null;
    }

    logger.info('Connection pool optimization monitoring stopped');
  }

  /**
   * Get optimization recommendations for a tenant
   */
  async getOptimizationRecommendations(tenantId) {
    const pool = this.pools.get(tenantId);
    const metrics = this.poolMetrics.get(tenantId);

    if (!pool || !metrics) {
      return { recommendations: ['No pool data available'] };
    }

    const recommendations = [];
    const currentConfig = pool.config;

    // Analyze connection utilization
    const utilizationRate = metrics.averageConnectionUtilization || 0;
    
    if (utilizationRate > 0.8) {
      recommendations.push({
        type: 'INCREASE_POOL_SIZE',
        message: 'High connection utilization detected. Consider increasing maxPoolSize.',
        current: currentConfig.maxPoolSize,
        suggested: Math.min(currentConfig.maxPoolSize * 1.5, 100)
      });
    } else if (utilizationRate < 0.3) {
      recommendations.push({
        type: 'DECREASE_POOL_SIZE',
        message: 'Low connection utilization detected. Consider decreasing maxPoolSize.',
        current: currentConfig.maxPoolSize,
        suggested: Math.max(currentConfig.maxPoolSize * 0.7, 3)
      });
    }

    // Analyze connection errors
    const errorRate = metrics.errorRate || 0;
    
    if (errorRate > 0.05) {
      recommendations.push({
        type: 'ADJUST_TIMEOUTS',
        message: 'High error rate detected. Consider increasing timeout values.',
        current: {
          serverSelection: currentConfig.serverSelectionTimeoutMS,
          socket: currentConfig.socketTimeoutMS
        },
        suggested: {
          serverSelection: currentConfig.serverSelectionTimeoutMS * 1.5,
          socket: currentConfig.socketTimeoutMS * 1.2
        }
      });
    }

    // Analyze idle connections
    const idleRate = metrics.averageIdleConnections || 0;
    
    if (idleRate > currentConfig.maxPoolSize * 0.5) {
      recommendations.push({
        type: 'REDUCE_IDLE_TIME',
        message: 'High number of idle connections. Consider reducing maxIdleTimeMS.',
        current: currentConfig.maxIdleTimeMS,
        suggested: Math.max(currentConfig.maxIdleTimeMS * 0.8, 60000)
      });
    }

    return {
      tenantId,
      timestamp: new Date(),
      currentConfig,
      metrics,
      recommendations
    };
  }

  /**
   * Apply recommendations to optimize pool
   */
  async applyOptimizationRecommendations(tenantId, recommendations) {
    try {
      const pool = this.pools.get(tenantId);
      if (!pool) throw new Error('Pool not found');

      let newConfig = { ...pool.config };

      for (const recommendation of recommendations) {
        switch (recommendation.type) {
          case 'INCREASE_POOL_SIZE':
            newConfig.maxPoolSize = recommendation.suggested;
            break;
          case 'DECREASE_POOL_SIZE':
            newConfig.maxPoolSize = recommendation.suggested;
            break;
          case 'ADJUST_TIMEOUTS':
            newConfig.serverSelectionTimeoutMS = recommendation.suggested.serverSelection;
            newConfig.socketTimeoutMS = recommendation.suggested.socket;
            break;
          case 'REDUCE_IDLE_TIME':
            newConfig.maxIdleTimeMS = recommendation.suggested;
            break;
        }
      }

      // Apply the new configuration
      const newConnection = await this.createConnectionWithConfig(newConfig);
      await this.replacePoolConnection(tenantId, newConnection, newConfig);

      logger.info(`Applied optimization recommendations for tenant ${tenantId}`, {
        appliedRecommendations: recommendations.length
      });

      return true;

    } catch (error) {
      logger.error(`Failed to apply optimization recommendations for tenant ${tenantId}:`, error);
      throw error;
    }
  }

  // Helper methods
  initializePoolMetrics() {
    return {
      totalConnections: 0,
      totalDisconnections: 0,
      totalErrors: 0,
      commandsExecuted: 0,
      averageResponseTime: 0,
      peakConnections: 0,
      averageConnectionUtilization: 0,
      errorRate: 0,
      createdAt: new Date()
    };
  }

  updatePoolMetrics(tenantId, metric, value) {
    const metrics = this.poolMetrics.get(tenantId);
    if (metrics) {
      if (typeof metrics[metric] === 'number') {
        metrics[metric] += value;
      } else {
        metrics[metric] = value;
      }
      metrics.lastUpdated = new Date();
    }
  }

  async getTenantProfile(tenantId) {
    // This would integrate with your tenant management system
    // For now, return default profile
    return {
      expectedConcurrentUsers: 20,
      readHeavy: true,
      consistencyRequired: false,
      highAvailability: true,
      durabilityRequired: true,
      largeDocuments: false,
      continuousUsage: false,
      burstTraffic: true
    };
  }

  isPeakHour() {
    const hour = new Date().getHours();
    return hour >= 9 && hour <= 17; // 9 AM to 5 PM
  }

  getSystemMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    return (totalMem - freeMem) / totalMem;
  }
}

// Export singleton instance
export const connectionPoolOptimizer = new ConnectionPoolOptimizer();
