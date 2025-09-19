// src/infrastructure/database/mongodb/sharding-manager.js
import { logger } from "#utils/core/logger.js";
import { CacheService } from "#core/cache/services/unified-cache.service.js";
import crypto from "crypto";

/**
 * MongoDB Sharding Manager for Multi-tenant Architecture
 */
export class ShardingManager {
  constructor() {
    this.shardMap = new Map(); // tenantId -> shard info
    this.shardConnections = new Map(); // shardId -> connection
    this.shardingStrategies = new Map();
    this.shardMetrics = new Map();
    this.initializeShardingStrategies();
  }

  /**
   * Initialize different sharding strategies
   */
  initializeShardingStrategies() {
    // Geographic sharding strategy
    this.shardingStrategies.set('GEOGRAPHIC', {
      name: 'Geographic Sharding',
      determineShardKey: (tenantData) => {
        const region = tenantData.region || 'default';
        return `geo_${region}`;
      },
      shardKeyFields: { region: 1, tenantId: 1 },
      description: 'Shard by geographic region for data locality'
    });

    // Size-based sharding strategy
    this.shardingStrategies.set('SIZE_BASED', {
      name: 'Size-based Sharding',
      determineShardKey: (tenantData) => {
        const size = tenantData.estimatedSize || 'small';
        return `size_${size}`;
      },
      shardKeyFields: { tenantSize: 1, tenantId: 1 },
      description: 'Shard by tenant size (small, medium, large)'
    });

    // Hash-based sharding strategy
    this.shardingStrategies.set('HASH_BASED', {
      name: 'Hash-based Sharding',
      determineShardKey: (tenantData) => {
        const hash = crypto.createHash('md5')
          .update(tenantData.tenantId)
          .digest('hex');
        const shardNum = parseInt(hash.substring(0, 8), 16) % 4; // 4 shards
        return `hash_${shardNum}`;
      },
      shardKeyFields: { tenantId: 'hashed' },
      description: 'Evenly distribute tenants using hash function'
    });

    // Time-based sharding strategy
    this.shardingStrategies.set('TIME_BASED', {
      name: 'Time-based Sharding',
      determineShardKey: (tenantData) => {
        const year = new Date(tenantData.createdAt).getFullYear();
        return `time_${year}`;
      },
      shardKeyFields: { createdAt: 1, tenantId: 1 },
      description: 'Shard by tenant creation time for archival patterns'
    });

    // Performance-based sharding strategy
    this.shardingStrategies.set('PERFORMANCE_BASED', {
      name: 'Performance-based Sharding',
      determineShardKey: (tenantData) => {
        const tier = this.determineTenantTier(tenantData);
        return `perf_${tier}`;
      },
      shardKeyFields: { performanceTier: 1, tenantId: 1 },
      description: 'Shard by performance requirements (basic, premium, enterprise)'
    });
  }

  /**
   * Configure sharding for a collection
   */
  async configureSharding(database, collectionName, strategy = 'HASH_BASED', options = {}) {
    try {
      logger.info(`Configuring sharding for collection: ${collectionName}`);

      const shardingStrategy = this.shardingStrategies.get(strategy);
      if (!shardingStrategy) {
        throw new Error(`Unknown sharding strategy: ${strategy}`);
      }

      // Enable sharding on database
      await database.adminCommand({ enableSharding: database.databaseName });

      // Create shard key index
      const collection = database.collection(collectionName);
      await collection.createIndex(shardingStrategy.shardKeyFields, {
        name: `${collectionName}_shard_key_idx`,
        background: true
      });

      // Shard the collection
      const shardCommand = {
        shardCollection: `${database.databaseName}.${collectionName}`,
        key: shardingStrategy.shardKeyFields,
        ...options
      };

      await database.adminCommand(shardCommand);

      // Store sharding configuration
      await this.storeShardingConfig(collectionName, strategy, shardingStrategy);

      logger.info(`Sharding configured successfully for ${collectionName}`);

      return {
        collection: collectionName,
        strategy: strategy,
        shardKey: shardingStrategy.shardKeyFields,
        status: 'configured'
      };

    } catch (error) {
      logger.error(`Sharding configuration failed for ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Route tenant to appropriate shard
   */
  async routeTenantToShard(tenantData, strategy = 'HASH_BASED') {
    try {
      const shardingStrategy = this.shardingStrategies.get(strategy);
      if (!shardingStrategy) {
        throw new Error(`Unknown sharding strategy: ${strategy}`);
      }

      const shardKey = shardingStrategy.determineShardKey(tenantData);
      
      // Store mapping for future reference
      this.shardMap.set(tenantData.tenantId, {
        shardKey,
        strategy,
        routedAt: new Date(),
        tenantData: {
          tenantId: tenantData.tenantId,
          region: tenantData.region,
          size: tenantData.estimatedSize,
          tier: tenantData.performanceTier
        }
      });

      // Update shard metrics
      this.updateShardMetrics(shardKey, 'tenantCount', 1);

      logger.info(`Tenant ${tenantData.tenantId} routed to shard: ${shardKey}`);

      return {
        tenantId: tenantData.tenantId,
        shardKey,
        strategy,
        shardingFields: this.buildShardingFields(tenantData, shardingStrategy)
      };

    } catch (error) {
      logger.error(`Tenant routing failed for ${tenantData.tenantId}:`, error);
      throw error;
    }
  }

  /**
   * Build sharding fields for document insertion
   */
  buildShardingFields(tenantData, shardingStrategy) {
    const fields = {};

    for (const fieldName of Object.keys(shardingStrategy.shardKeyFields)) {
      switch (fieldName) {
        case 'tenantId':
          fields.tenantId = tenantData.tenantId;
          break;
        case 'region':
          fields.region = tenantData.region || 'default';
          break;
        case 'tenantSize':
          fields.tenantSize = tenantData.estimatedSize || 'small';
          break;
        case 'createdAt':
          fields.createdAt = tenantData.createdAt || new Date();
          break;
        case 'performanceTier':
          fields.performanceTier = tenantData.performanceTier || 'basic';
          break;
      }
    }

    return fields;
  }

  /**
   * Monitor shard distribution and balance
   */
  async monitorShardBalance() {
    try {
      const shardStats = await this.collectShardStatistics();
      const balanceMetrics = this.calculateBalanceMetrics(shardStats);
      
      // Check if rebalancing is needed
      if (balanceMetrics.imbalanceScore > 0.3) {
        logger.warn('Shard imbalance detected', {
          imbalanceScore: balanceMetrics.imbalanceScore,
          recommendations: balanceMetrics.recommendations
        });

        // Trigger rebalancing if auto-balance is enabled
        if (process.env.AUTO_SHARD_BALANCE === 'true') {
          await this.triggerRebalancing(balanceMetrics);
        }
      }

      return balanceMetrics;

    } catch (error) {
      logger.error('Shard balance monitoring failed:', error);
      throw error;
    }
  }

  /**
   * Collect comprehensive shard statistics
   */
  async collectShardStatistics() {
    const shardStats = new Map();

    try {
      // This would connect to each shard and collect statistics
      // For demonstration, we'll simulate the data structure
      
      for (const [shardKey, metrics] of this.shardMetrics) {
        const stats = {
          shardKey,
          tenantCount: metrics.tenantCount || 0,
          documentCount: metrics.documentCount || 0,
          dataSize: metrics.dataSize || 0,
          indexSize: metrics.indexSize || 0,
          avgResponseTime: metrics.avgResponseTime || 0,
          throughput: metrics.throughput || 0,
          activeConnections: metrics.activeConnections || 0,
          lastUpdated: new Date()
        };

        shardStats.set(shardKey, stats);
      }

      return shardStats;

    } catch (error) {
      logger.error('Failed to collect shard statistics:', error);
      throw error;
    }
  }

  /**
   * Calculate balance metrics across shards
   */
  calculateBalanceMetrics(shardStats) {
    const stats = Array.from(shardStats.values());
    
    if (stats.length === 0) {
      return { imbalanceScore: 0, balanced: true };
    }

    const totalTenants = stats.reduce((sum, stat) => sum + stat.tenantCount, 0);
    const totalData = stats.reduce((sum, stat) => sum + stat.dataSize, 0);
    const totalDocs = stats.reduce((sum, stat) => sum + stat.documentCount, 0);
    
    const avgTenants = totalTenants / stats.length;
    const avgData = totalData / stats.length;
    const avgDocs = totalDocs / stats.length;

    // Calculate variance for each metric
    const tenantVariance = this.calculateVariance(stats.map(s => s.tenantCount), avgTenants);
    const dataVariance = this.calculateVariance(stats.map(s => s.dataSize), avgData);
    const docVariance = this.calculateVariance(stats.map(s => s.documentCount), avgDocs);

    // Calculate imbalance score (0 = perfectly balanced, 1 = maximally imbalanced)
    const tenantImbalance = Math.sqrt(tenantVariance) / Math.max(avgTenants, 1);
    const dataImbalance = Math.sqrt(dataVariance) / Math.max(avgData, 1);
    const docImbalance = Math.sqrt(docVariance) / Math.max(avgDocs, 1);

    const imbalanceScore = (tenantImbalance + dataImbalance + docImbalance) / 3;

    const metrics = {
      imbalanceScore,
      balanced: imbalanceScore < 0.2,
      shardCount: stats.length,
      totalTenants,
      totalDataSize: totalData,
      totalDocuments: totalDocs,
      averages: {
        tenantsPerShard: avgTenants,
        dataSizePerShard: avgData,
        documentsPerShard: avgDocs
      },
      variances: {
        tenantVariance,
        dataVariance,
        docVariance
      },
      recommendations: this.generateBalancingRecommendations(stats, imbalanceScore)
    };

    return metrics;
  }

  /**
   * Generate recommendations for shard balancing
   */
  generateBalancingRecommendations(shardStats, imbalanceScore) {
    const recommendations = [];

    if (imbalanceScore > 0.5) {
      recommendations.push({
        type: 'CRITICAL_IMBALANCE',
        message: 'Critical shard imbalance detected',
        action: 'Immediate rebalancing required',
        priority: 'HIGH'
      });
    } else if (imbalanceScore > 0.3) {
      recommendations.push({
        type: 'MODERATE_IMBALANCE',
        message: 'Moderate shard imbalance detected',
        action: 'Consider rebalancing during low-traffic period',
        priority: 'MEDIUM'
      });
    }

    // Check for hot shards
    const avgTenants = shardStats.reduce((sum, stat) => sum + stat.tenantCount, 0) / shardStats.length;
    const hotShards = shardStats.filter(stat => stat.tenantCount > avgTenants * 1.5);
    
    if (hotShards.length > 0) {
      recommendations.push({
        type: 'HOT_SHARD_DETECTED',
        message: `${hotShards.length} hot shard(s) detected`,
        action: 'Consider splitting hot shards or redistributing tenants',
        hotShards: hotShards.map(s => s.shardKey),
        priority: 'MEDIUM'
      });
    }

    // Check for underutilized shards
    const underutilizedShards = shardStats.filter(stat => stat.tenantCount < avgTenants * 0.5);
    
    if (underutilizedShards.length > 0) {
      recommendations.push({
        type: 'UNDERUTILIZED_SHARDS',
        message: `${underutilizedShards.length} underutilized shard(s) detected`,
        action: 'Consider consolidating or redistributing tenants',
        underutilizedShards: underutilizedShards.map(s => s.shardKey),
        priority: 'LOW'
      });
    }

    return recommendations;
  }

  /**
   * Trigger automatic rebalancing
   */
  async triggerRebalancing(balanceMetrics) {
    try {
      logger.info('Starting automatic shard rebalancing');

      // Implement rebalancing logic based on MongoDB's balancer
      // This would typically involve:
      // 1. Identifying chunk ranges to move
      // 2. Moving chunks from overloaded to underloaded shards
      // 3. Monitoring the rebalancing process

      const rebalancingPlan = this.createRebalancingPlan(balanceMetrics);
      
      for (const operation of rebalancingPlan.operations) {
        await this.executeRebalancingOperation(operation);
      }

      logger.info('Automatic shard rebalancing completed');

      return {
        status: 'completed',
        operationsExecuted: rebalancingPlan.operations.length,
        duration: rebalancingPlan.estimatedDuration
      };

    } catch (error) {
      logger.error('Automatic rebalancing failed:', error);
      throw error;
    }
  }

  /**
   * Create tenant-aware queries with proper shard targeting
   */
  createShardedQuery(tenantId, baseQuery = {}) {
    const shardInfo = this.shardMap.get(tenantId);
    
    if (!shardInfo) {
      // If no shard info available, include tenantId for proper routing
      return {
        ...baseQuery,
        tenantId
      };
    }

    const shardingStrategy = this.shardingStrategies.get(shardInfo.strategy);
    const shardingFields = this.buildShardingFields(shardInfo.tenantData, shardingStrategy);

    return {
      ...baseQuery,
      ...shardingFields
    };
  }

  /**
   * Get shard information for tenant
   */
  getTenantShardInfo(tenantId) {
    return this.shardMap.get(tenantId);
  }

  /**
   * Get sharding recommendations for new tenant
   */
  async getShardingRecommendations(tenantData) {
    const recommendations = [];

    // Analyze tenant characteristics
    const characteristics = this.analyzeTenantCharacteristics(tenantData);
    
    // Recommend strategies based on characteristics
    if (characteristics.hasGeographicRequirements) {
      recommendations.push({
        strategy: 'GEOGRAPHIC',
        reason: 'Tenant has specific geographic requirements',
        benefits: ['Data locality', 'Compliance', 'Reduced latency'],
        priority: 'HIGH'
      });
    }

    if (characteristics.isLargeTenant) {
      recommendations.push({
        strategy: 'SIZE_BASED',
        reason: 'Large tenant requiring dedicated resources',
        benefits: ['Resource isolation', 'Performance predictability'],
        priority: 'HIGH'
      });
    }

    if (characteristics.hasHighPerformanceRequirements) {
      recommendations.push({
        strategy: 'PERFORMANCE_BASED',
        reason: 'High performance requirements detected',
        benefits: ['Optimized resource allocation', 'SLA compliance'],
        priority: 'MEDIUM'
      });
    }

    // Default recommendation
    if (recommendations.length === 0) {
      recommendations.push({
        strategy: 'HASH_BASED',
        reason: 'Default strategy for even distribution',
        benefits: ['Even distribution', 'Scalability', 'Simplicity'],
        priority: 'MEDIUM'
      });
    }

    return recommendations;
  }

  // Helper methods
  determineTenantTier(tenantData) {
    if (tenantData.performanceTier) return tenantData.performanceTier;
    
    // Simple heuristic based on expected usage
    const expectedUsers = tenantData.expectedUsers || 0;
    if (expectedUsers > 1000) return 'enterprise';
    if (expectedUsers > 100) return 'premium';
    return 'basic';
  }

  updateShardMetrics(shardKey, metric, value) {
    if (!this.shardMetrics.has(shardKey)) {
      this.shardMetrics.set(shardKey, {});
    }
    
    const metrics = this.shardMetrics.get(shardKey);
    if (typeof metrics[metric] === 'number') {
      metrics[metric] += value;
    } else {
      metrics[metric] = value;
    }
    metrics.lastUpdated = new Date();
  }

  calculateVariance(values, mean) {
    if (values.length === 0) return 0;
    
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  analyzeTenantCharacteristics(tenantData) {
    return {
      hasGeographicRequirements: !!tenantData.region && tenantData.region !== 'default',
      isLargeTenant: (tenantData.expectedUsers || 0) > 500,
      hasHighPerformanceRequirements: tenantData.performanceTier === 'enterprise' || tenantData.performanceTier === 'premium',
      hasComplianceRequirements: !!tenantData.complianceRequirements,
      expectedDataGrowth: tenantData.expectedDataGrowth || 'medium'
    };
  }
}

// Export singleton instance
export const shardingManager = new ShardingManager();
