// src/infrastructure/cache/redis/redis-cluster-manager.js
import Redis from "ioredis";
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";

/**
 * Redis Cluster Manager for High Availability
 * Manages Redis cluster connections, failover, and health monitoring
 */
export class RedisClusterManager extends EventEmitter {
  constructor() {
    super();
    this.clusters = new Map(); // clusterId -> cluster instance
    this.clusterHealth = new Map(); // clusterId -> health status
    this.healthCheckInterval = null;
    this.connectionOptions = this.getClusterConnectionOptions();
  }

  /**
   * Get cluster connection options
   */
  getClusterConnectionOptions() {
    return {
      // Cluster discovery
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      enableOfflineQueue: false,
      
      // Connection settings
      connectTimeout: 10000,
      commandTimeout: 5000,
      lazyConnect: true,
      keepAlive: 30000,
      
      // Cluster-specific settings
      redisOptions: {
        password: process.env.REDIS_PASSWORD,
        db: 0,
        keyPrefix: process.env.REDIS_KEY_PREFIX || 'school-erp:',
        
        // Connection pool settings
        family: 4,
        keepAlive: true,
        
        // Retry settings
        retryDelayOnClusterDown: 300,
        retryDelayOnRandomNode: 200,
        maxRetriesPerRequest: 3,
        
        // Performance settings
        enableAutoPipelining: true,
        maxMemoryPolicy: 'allkeys-lru'
      },
      
      // Cluster options
      scaleReads: 'slave',
      enableReadyCheck: true,
      redisOptions: {
        connectTimeout: 5000,
        commandTimeout: 2000
      },
      
      // Health check settings  
      pingInterval: 30000,
      clusterRetryDelayOnFailover: 100,
      clusterRetryDelayOnClusterDown: 300
    };
  }

  /**
   * Initialize Redis cluster
   */
  async initializeCluster(clusterId, nodes, options = {}) {
    try {
      logger.info(`Initializing Redis cluster: ${clusterId}`);

      const clusterOptions = {
        ...this.connectionOptions,
        ...options
      };

      // Create cluster instance
      const cluster = new Redis.Cluster(nodes, clusterOptions);

      // Setup event handlers
      this.setupClusterEventHandlers(clusterId, cluster);

      // Wait for cluster to be ready
      await cluster.ping();

      // Store cluster instance
      this.clusters.set(clusterId, {
        id: clusterId,
        instance: cluster,
        nodes,
        options: clusterOptions,
        createdAt: new Date(),
        isHealthy: true,
        lastHealthCheck: new Date()
      });

      this.clusterHealth.set(clusterId, {
        status: 'healthy',
        lastCheck: new Date(),
        uptime: 0,
        totalOperations: 0,
        errorCount: 0,
        averageResponseTime: 0
      });

      logger.info(`Redis cluster initialized successfully: ${clusterId}`);
      this.emit('clusterConnected', { clusterId, nodes });

      return cluster;

    } catch (error) {
      logger.error(`Failed to initialize Redis cluster ${clusterId}:`, error);
      throw error;
    }
  }

  /**
   * Setup cluster event handlers
   */
  setupClusterEventHandlers(clusterId, cluster) {
    // Connection events
    cluster.on('connect', () => {
      logger.info(`Redis cluster connected: ${clusterId}`);
      this.updateClusterHealth(clusterId, 'connected');
    });

    cluster.on('ready', () => {
      logger.info(`Redis cluster ready: ${clusterId}`);
      this.updateClusterHealth(clusterId, 'ready');
    });

    cluster.on('error', (error) => {
      logger.error(`Redis cluster error ${clusterId}:`, error);
      this.updateClusterHealth(clusterId, 'error', error);
      this.emit('clusterError', { clusterId, error });
    });

    cluster.on('close', () => {
      logger.warn(`Redis cluster connection closed: ${clusterId}`);
      this.updateClusterHealth(clusterId, 'closed');
    });

    cluster.on('reconnecting', () => {
      logger.info(`Redis cluster reconnecting: ${clusterId}`);
      this.updateClusterHealth(clusterId, 'reconnecting');
    });

    // Node events
    cluster.on('+node', (node) => {
      logger.info(`New Redis node added to cluster ${clusterId}:`, node.options);
      this.emit('nodeAdded', { clusterId, node });
    });

    cluster.on('-node', (node) => {
      logger.warn(`Redis node removed from cluster ${clusterId}:`, node.options);
      this.emit('nodeRemoved', { clusterId, node });
    });

    cluster.on('node error', (error, node) => {
      logger.error(`Redis node error in cluster ${clusterId}:`, error, node.options);
      this.emit('nodeError', { clusterId, error, node });
    });

    // Failover events
    cluster.on('failover', (error, node) => {
      logger.warn(`Redis cluster failover ${clusterId}:`, error, node?.options);
      this.emit('failover', { clusterId, error, node });
    });
  }

  /**
   * Get cluster instance
   */
  getCluster(clusterId = 'default') {
    const cluster = this.clusters.get(clusterId);
    return cluster ? cluster.instance : null;
  }

  /**
   * Execute command with automatic failover
   */
  async executeCommand(clusterId, command, args = [], options = {}) {
    const cluster = this.getCluster(clusterId);
    if (!cluster) {
      throw new Error(`Redis cluster not found: ${clusterId}`);
    }

    const startTime = Date.now();
    try {
      const result = await cluster[command](...args);
      
      // Update metrics
      this.updateOperationMetrics(clusterId, Date.now() - startTime, true);
      
      return result;
    } catch (error) {
      // Update error metrics
      this.updateOperationMetrics(clusterId, Date.now() - startTime, false);
      
      logger.error(`Redis cluster command failed ${clusterId}:`, {
        command,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring(intervalMs = 30000) {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, intervalMs);

    logger.info('Redis cluster health monitoring started');
  }

  /**
   * Perform health check on all clusters
   */
  async performHealthCheck() {
    for (const [clusterId, clusterInfo] of this.clusters) {
      try {
        const startTime = Date.now();
        
        // Ping cluster
        await clusterInfo.instance.ping();
        
        const responseTime = Date.now() - startTime;
        
        // Update health status
        const health = this.clusterHealth.get(clusterId);
        if (health) {
          health.status = 'healthy';
          health.lastCheck = new Date();
          health.averageResponseTime = (health.averageResponseTime + responseTime) / 2;
          clusterInfo.isHealthy = true;
        }

        // Check cluster info
        const clusterNodes = await clusterInfo.instance.cluster('nodes');
        this.analyzeClusterTopology(clusterId, clusterNodes);

      } catch (error) {
        logger.error(`Health check failed for cluster ${clusterId}:`, error);
        
        const health = this.clusterHealth.get(clusterId);
        if (health) {
          health.status = 'unhealthy';
          health.lastCheck = new Date();
          health.errorCount++;
        }
        
        const clusterInfo = this.clusters.get(clusterId);
        if (clusterInfo) {
          clusterInfo.isHealthy = false;
        }

        this.emit('healthCheckFailed', { clusterId, error });
      }
    }
  }

  /**
   * Analyze cluster topology
   */
  analyzeClusterTopology(clusterId, nodesInfo) {
    const nodes = nodesInfo.split('\n').filter(line => line.trim());
    const topology = {
      masters: 0,
      slaves: 0,
      failing: 0,
      total: nodes.length - 1 // Remove empty line
    };

    nodes.forEach(nodeInfo => {
      if (nodeInfo.includes('master')) topology.masters++;
      if (nodeInfo.includes('slave')) topology.slaves++;
      if (nodeInfo.includes('fail')) topology.failing++;
    });

    // Emit topology change if significant
    this.emit('topologyAnalyzed', { clusterId, topology });

    // Alert if issues detected
    if (topology.failing > 0) {
      logger.warn(`Failing nodes detected in cluster ${clusterId}:`, topology);
    }

    if (topology.masters < 3) {
      logger.warn(`Insufficient master nodes in cluster ${clusterId}:`, topology);
    }
  }

  /**
   * Get cluster statistics
   */
  async getClusterStatistics() {
    const stats = {
      clusters: {},
      summary: {
        totalClusters: this.clusters.size,
        healthyClusters: 0,
        totalNodes: 0,
        totalOperations: 0,
        averageResponseTime: 0
      }
    };

    for (const [clusterId, clusterInfo] of this.clusters) {
      try {
        const clusterStats = await this.getIndividualClusterStats(clusterId, clusterInfo);
        stats.clusters[clusterId] = clusterStats;

        // Update summary
        if (clusterInfo.isHealthy) stats.summary.healthyClusters++;
        stats.summary.totalNodes += clusterStats.nodeCount;
        
        const health = this.clusterHealth.get(clusterId);
        if (health) {
          stats.summary.totalOperations += health.totalOperations;
        }

      } catch (error) {
        logger.error(`Failed to get stats for cluster ${clusterId}:`, error);
      }
    }

    return stats;
  }

  /**
   * Get individual cluster statistics
   */
  async getIndividualClusterStats(clusterId, clusterInfo) {
    const cluster = clusterInfo.instance;
    const health = this.clusterHealth.get(clusterId);

    try {
      // Get cluster info
      const info = await cluster.cluster('info');
      const nodes = await cluster.cluster('nodes');
      
      // Parse cluster info
      const infoLines = info.split('\r\n');
      const clusterState = infoLines.find(line => line.startsWith('cluster_state:'))?.split(':')[1];
      const clusterSlotsAssigned = infoLines.find(line => line.startsWith('cluster_slots_assigned:'))?.split(':')[1];

      // Count nodes
      const nodeLines = nodes.split('\n').filter(line => line.trim());
      const nodeCount = nodeLines.length - 1;

      return {
        clusterId,
        isHealthy: clusterInfo.isHealthy,
        state: clusterState,
        nodeCount,
        slotsAssigned: parseInt(clusterSlotsAssigned) || 0,
        uptime: health?.uptime || 0,
        totalOperations: health?.totalOperations || 0,
        errorCount: health?.errorCount || 0,
        averageResponseTime: health?.averageResponseTime || 0,
        lastHealthCheck: health?.lastCheck
      };

    } catch (error) {
      return {
        clusterId,
        isHealthy: false,
        error: error.message
      };
    }
  }

  // Helper methods
  updateClusterHealth(clusterId, status, error = null) {
    const health = this.clusterHealth.get(clusterId);
    if (health) {
      health.status = status;
      health.lastCheck = new Date();
      if (error) {
        health.errorCount++;
      }
    }
  }

  updateOperationMetrics(clusterId, responseTime, success) {
    const health = this.clusterHealth.get(clusterId);
    if (health) {
      health.totalOperations++;
      health.averageResponseTime = (health.averageResponseTime + responseTime) / 2;
      if (!success) {
        health.errorCount++;
      }
    }
  }
}

// Export singleton instance
export const redisClusterManager = new RedisClusterManager();
