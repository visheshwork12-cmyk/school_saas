// src/infrastructure/database/mongodb/read-replica-manager.js
import mongoose from "mongoose";
import { logger } from "#utils/core/logger.js";
import { CacheService } from "#core/cache/services/unified-cache.service.js";

/**
 * MongoDB Read Replica Manager
 * Manages read replicas for improved read performance and load distribution
 */
export class ReadReplicaManager {
  constructor() {
    this.primaryConnection = null;
    this.readReplicas = new Map(); // replicaId -> connection
    this.replicaHealth = new Map(); // replicaId -> health status
    this.loadBalancer = null;
    this.healthCheckInterval = null;
    this.replicaMetrics = new Map();
    this.queryRouter = new QueryRouter();
    this.initializeLoadBalancer();
  }

  /**
   * Initialize read replica load balancer
   */
  initializeLoadBalancer() {
    this.loadBalancer = new ReplicaLoadBalancer({
      algorithm: process.env.REPLICA_LOAD_BALANCE_ALGORITHM || 'ROUND_ROBIN',
      healthCheckEnabled: true,
      maxRetries: 3
    });
  }

  /**
   * Configure read replicas
   */
  async configureReadReplicas(primaryConfig, replicaConfigs) {
    try {
      logger.info('Configuring read replica setup');

      // Establish primary connection
      this.primaryConnection = await this.createPrimaryConnection(primaryConfig);
      
      // Setup read replicas
      for (const replicaConfig of replicaConfigs) {
        await this.addReadReplica(replicaConfig);
      }

      // Start health monitoring
      this.startHealthMonitoring();

      // Setup query routing
      await this.setupQueryRouting();

      logger.info(`Read replica setup completed. Primary: 1, Replicas: ${this.readReplicas.size}`);

      return {
        primary: this.primaryConnection ? 1 : 0,
        replicas: this.readReplicas.size,
        status: 'configured'
      };

    } catch (error) {
      logger.error('Read replica configuration failed:', error);
      throw error;
    }
  }

  /**
   * Create primary database connection
   */
  async createPrimaryConnection(config) {
    try {
      const primaryConfig = {
        ...config,
        readPreference: 'primary',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true },
        appName: `school-erp-primary-${process.env.NODE_ENV}`,
        maxPoolSize: config.maxPoolSize || 20,
        minPoolSize: config.minPoolSize || 5
      };

      const connection = await mongoose.createConnection(config.uri, primaryConfig);
      
      // Setup primary connection monitoring
      this.setupPrimaryMonitoring(connection);

      logger.info('Primary database connection established');
      return connection;

    } catch (error) {
      logger.error('Primary connection failed:', error);
      throw error;
    }
  }

  /**
   * Add read replica connection
   */
  async addReadReplica(config) {
    try {
      const replicaId = config.replicaId || `replica_${this.readReplicas.size + 1}`;
      
      const replicaConfig = {
        ...config,
        readPreference: 'secondary',
        readConcern: { level: config.readConcern || 'local' },
        appName: `school-erp-replica-${replicaId}-${process.env.NODE_ENV}`,
        maxPoolSize: config.maxPoolSize || 15,
        minPoolSize: config.minPoolSize || 2,
        
        // Replica-specific optimizations
        serverSelectionTimeoutMS: 5000,
        localThresholdMS: 15, // Prefer faster replicas
        heartbeatFrequencyMS: 10000,
        
        // Read-optimized settings
        socketTimeoutMS: 0, // No timeout for long-running reads
        maxIdleTimeMS: 120000, // 2 minutes
        
        // Compression for large result sets
        compressors: ['zstd', 'zlib'],
        zlibCompressionLevel: 6
      };

      const connection = await mongoose.createConnection(config.uri, replicaConfig);
      
      // Store replica connection
      this.readReplicas.set(replicaId, {
        id: replicaId,
        connection,
        config: replicaConfig,
        region: config.region || 'default',
        priority: config.priority || 1,
        createdAt: new Date(),
        isHealthy: false,
        lastHealthCheck: null,
        metrics: this.initializeReplicaMetrics()
      });

      // Setup replica monitoring
      this.setupReplicaMonitoring(replicaId, connection);

      // Add to load balancer
      this.loadBalancer.addReplica(replicaId, {
        priority: config.priority || 1,
        region: config.region || 'default',
        capacity: config.capacity || 100
      });

      logger.info(`Read replica added: ${replicaId}`);

      return replicaId;

    } catch (error) {
      logger.error(`Failed to add read replica: ${config.replicaId}`, error);
      throw error;
    }
  }

  /**
   * Setup intelligent query routing
   */
  async setupQueryRouting() {
    this.queryRouter = new QueryRouter({
      primaryConnection: this.primaryConnection,
      replicas: this.readReplicas,
      loadBalancer: this.loadBalancer,
      routingRules: this.createRoutingRules()
    });

    logger.info('Query routing configured');
  }

  /**
   * Create query routing rules
   */
  createRoutingRules() {
    return {
      // Write operations always go to primary
      write: {
        target: 'primary',
        operations: ['insert', 'update', 'delete', 'replace', 'findAndModify']
      },

      // Real-time reads go to primary
      realTime: {
        target: 'primary',
        conditions: [
          (query, options) => options.readPreference === 'primary',
          (query, options) => options.realTime === true,
          (query, options) => options.consistency === 'strong'
        ]
      },

      // Analytics and reporting queries to replicas
      analytics: {
        target: 'replica',
        conditions: [
          (query, options) => options.analytics === true,
          (query, options) => options.allowStaleReads === true,
          (query, options) => this.isAnalyticsQuery(query)
        ],
        preferredReplicas: ['analytics_replica']
      },

      // Geographic routing
      geographic: {
        target: 'replica',
        conditions: [
          (query, options) => !!options.userRegion
        ],
        routingLogic: (query, options) => {
          return this.findNearestReplica(options.userRegion);
        }
      },

      // Load-based routing
      loadBalanced: {
        target: 'replica',
        conditions: [
          (query, options) => options.loadBalance !== false
        ],
        routingLogic: () => {
          return this.loadBalancer.selectReplica();
        }
      },

      // Default routing
      default: {
        target: 'replica',
        fallbackToPrimary: true
      }
    };
  }

  /**
   * Execute query with intelligent routing
   */
  async executeQuery(collection, operation, query, options = {}) {
    try {
      const routingDecision = this.queryRouter.route(operation, query, options);
      
      logger.debug('Query routing decision', {
        operation,
        target: routingDecision.target,
        replica: routingDecision.replicaId
      });

      let connection;
      let replicaId = null;

      if (routingDecision.target === 'primary') {
        connection = this.primaryConnection;
      } else {
        const replica = this.readReplicas.get(routingDecision.replicaId);
        if (!replica || !replica.isHealthy) {
          // Fallback to primary if replica unavailable
          logger.warn(`Replica ${routingDecision.replicaId} unavailable, falling back to primary`);
          connection = this.primaryConnection;
        } else {
          connection = replica.connection;
          replicaId = routingDecision.replicaId;
        }
      }

      // Execute query
      const startTime = Date.now();
      const result = await this.executeQueryOnConnection(connection, collection, operation, query, options);
      const executionTime = Date.now() - startTime;

      // Update metrics
      this.updateQueryMetrics(replicaId || 'primary', operation, executionTime, true);

      return result;

    } catch (error) {
      // Update error metrics
      this.updateQueryMetrics(replicaId || 'primary', operation, 0, false);
      
      logger.error('Query execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute query on specific connection
   */
  async executeQueryOnConnection(connection, collectionName, operation, query, options) {
    const collection = connection.collection(collectionName);

    switch (operation) {
      case 'find':
        return await collection.find(query, options).toArray();
      
      case 'findOne':
        return await collection.findOne(query, options);
      
      case 'aggregate':
        return await collection.aggregate(query, options).toArray();
      
      case 'count':
        return await collection.countDocuments(query, options);
      
      case 'distinct':
        return await collection.distinct(options.field, query, options);
      
      default:
        throw new Error(`Unsupported read operation: ${operation}`);
    }
  }

  /**
   * Start health monitoring for all replicas
   */
  startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
    }, 30000); // Every 30 seconds

    logger.info('Health monitoring started for read replicas');
  }

  /**
   * Perform health checks on all replicas
   */
  async performHealthChecks() {
    try {
      // Check primary
      if (this.primaryConnection) {
        await this.checkConnectionHealth('primary', this.primaryConnection);
      }

      // Check all replicas
      for (const [replicaId, replica] of this.readReplicas) {
        await this.checkConnectionHealth(replicaId, replica.connection);
      }

      // Update load balancer with health status
      this.updateLoadBalancerHealth();

    } catch (error) {
      logger.error('Health check failed:', error);
    }
  }

  /**
   * Check health of individual connection
   */
  async checkConnectionHealth(connectionId, connection) {
    try {
      const startTime = Date.now();
      
      // Perform ping
      await connection.db.admin.ping();
      
      const responseTime = Date.now() - startTime;
      const isHealthy = responseTime < 5000; // 5 second timeout

      // Update health status
      if (connectionId === 'primary') {
        // Primary health is critical
        if (!isHealthy) {
          logger.error('Primary connection health check failed');
        }
      } else {
        const replica = this.readReplicas.get(connectionId);
        if (replica) {
          replica.isHealthy = isHealthy;
          replica.lastHealthCheck = new Date();
          replica.metrics.responseTime = responseTime;

          if (!isHealthy) {
            logger.warn(`Replica ${connectionId} health check failed`);
            this.loadBalancer.markUnhealthy(connectionId);
          } else {
            this.loadBalancer.markHealthy(connectionId);
          }
        }
      }

    } catch (error) {
      logger.error(`Health check failed for ${connectionId}:`, error);
      
      if (connectionId !== 'primary') {
        const replica = this.readReplicas.get(connectionId);
        if (replica) {
          replica.isHealthy = false;
          this.loadBalancer.markUnhealthy(connectionId);
        }
      }
    }
  }

  /**
   * Get read replica performance metrics
   */
  getReplicaMetrics() {
    const metrics = {
      primary: {
        isConnected: !!this.primaryConnection,
        metrics: this.replicaMetrics.get('primary') || {}
      },
      replicas: {}
    };

    for (const [replicaId, replica] of this.readReplicas) {
      metrics.replicas[replicaId] = {
        isHealthy: replica.isHealthy,
        lastHealthCheck: replica.lastHealthCheck,
        region: replica.region,
        priority: replica.priority,
        metrics: replica.metrics
      };
    }

    return metrics;
  }

  /**
   * Get read replica recommendations
   */
  async getReplicaRecommendations() {
    const metrics = this.getReplicaMetrics();
    const recommendations = [];

    // Analyze read/write ratio
    const totalReads = Object.values(metrics.replicas)
      .reduce((sum, replica) => sum + (replica.metrics.totalReads || 0), 0);
    const totalWrites = metrics.primary.metrics.totalWrites || 0;
    
    const readWriteRatio = totalReads / Math.max(totalWrites, 1);

    if (readWriteRatio > 5 && this.readReplicas.size < 3) {
      recommendations.push({
        type: 'ADD_READ_REPLICA',
        message: 'High read/write ratio detected. Consider adding more read replicas.',
        currentReplicas: this.readReplicas.size,
        suggestedReplicas: Math.min(this.readReplicas.size + 2, 5),
        impact: 'HIGH'
      });
    }

    // Check for unhealthy replicas
    const unhealthyReplicas = Array.from(this.readReplicas.values())
      .filter(replica => !replica.isHealthy);

    if (unhealthyReplicas.length > 0) {
      recommendations.push({
        type: 'REPLICA_HEALTH_ISSUE',
        message: `${unhealthyReplicas.length} replica(s) are unhealthy`,
        unhealthyReplicas: unhealthyReplicas.map(r => r.id),
        impact: 'MEDIUM'
      });
    }

    // Geographic distribution recommendations
    const regions = new Set(Array.from(this.readReplicas.values()).map(r => r.region));
    
    if (regions.size === 1 && regions.has('default')) {
      recommendations.push({
        type: 'GEOGRAPHIC_DISTRIBUTION',
        message: 'Consider distributing read replicas across geographic regions',
        suggestion: 'Add replicas in different regions for better performance',
        impact: 'MEDIUM'
      });
    }

    return recommendations;
  }

  // Helper methods and classes
  initializeReplicaMetrics() {
    return {
      totalQueries: 0,
      totalReads: 0,
      averageResponseTime: 0,
      errorCount: 0,
      lastQueryTime: null,
      createdAt: new Date()
    };
  }

  updateQueryMetrics(targetId, operation, executionTime, success) {
    if (!this.replicaMetrics.has(targetId)) {
      this.replicaMetrics.set(targetId, this.initializeReplicaMetrics());
    }

    const metrics = this.replicaMetrics.get(targetId);
    metrics.totalQueries++;
    
    if (operation === 'find' || operation === 'findOne' || operation === 'aggregate') {
      metrics.totalReads++;
    }

    if (success) {
      // Update average response time
      const currentTotal = metrics.averageResponseTime * (metrics.totalQueries - 1);
      metrics.averageResponseTime = (currentTotal + executionTime) / metrics.totalQueries;
    } else {
      metrics.errorCount++;
    }

    metrics.lastQueryTime = new Date();
  }

  isAnalyticsQuery(query) {
    // Simple heuristic to identify analytics queries
    return query.$group || query.$match || query.$sort || 
           (Array.isArray(query) && query.some(stage => stage.$group || stage.$match));
  }

  findNearestReplica(userRegion) {
    // Find replica in same region or closest region
    const regionReplicas = Array.from(this.readReplicas.values())
      .filter(replica => replica.region === userRegion && replica.isHealthy);

    if (regionReplicas.length > 0) {
      return regionReplicas[0].id;
    }

    // Fallback to any healthy replica
    const healthyReplicas = Array.from(this.readReplicas.values())
      .filter(replica => replica.isHealthy);

    return healthyReplicas.length > 0 ? healthyReplicas[0].id : null;
  }
}

/**
 * Load Balancer for Read Replicas
 */
class ReplicaLoadBalancer {
  constructor(options = {}) {
    this.algorithm = options.algorithm || 'ROUND_ROBIN';
    this.replicas = new Map();
    this.currentIndex = 0;
    this.healthCheckEnabled = options.healthCheckEnabled || true;
    this.maxRetries = options.maxRetries || 3;
  }

  addReplica(replicaId, config) {
    this.replicas.set(replicaId, {
      id: replicaId,
      isHealthy: true,
      priority: config.priority || 1,
      region: config.region || 'default',
      capacity: config.capacity || 100,
      currentLoad: 0,
      addedAt: new Date()
    });
  }

  selectReplica() {
    const healthyReplicas = Array.from(this.replicas.values())
      .filter(replica => replica.isHealthy);

    if (healthyReplicas.length === 0) {
      return null; // Will fallback to primary
    }

    switch (this.algorithm) {
      case 'ROUND_ROBIN':
        return this.roundRobinSelection(healthyReplicas);
      
      case 'WEIGHTED_ROUND_ROBIN':
        return this.weightedRoundRobinSelection(healthyReplicas);
      
      case 'LEAST_CONNECTIONS':
        return this.leastConnectionsSelection(healthyReplicas);
      
      case 'RANDOM':
        return this.randomSelection(healthyReplicas);
      
      default:
        return this.roundRobinSelection(healthyReplicas);
    }
  }

  roundRobinSelection(replicas) {
    const replica = replicas[this.currentIndex % replicas.length];
    this.currentIndex = (this.currentIndex + 1) % replicas.length;
    return replica.id;
  }

  weightedRoundRobinSelection(replicas) {
    // Select based on priority weights
    const totalWeight = replicas.reduce((sum, replica) => sum + replica.priority, 0);
    let random = Math.random() * totalWeight;
    
    for (const replica of replicas) {
      random -= replica.priority;
      if (random <= 0) {
        return replica.id;
      }
    }
    
    return replicas[0].id; // Fallback
  }

  leastConnectionsSelection(replicas) {
    // Select replica with lowest current load
    const sortedReplicas = replicas.sort((a, b) => a.currentLoad - b.currentLoad);
    return sortedReplicas[0].id;
  }

  randomSelection(replicas) {
    const randomIndex = Math.floor(Math.random() * replicas.length);
    return replicas[randomIndex].id;
  }

  markHealthy(replicaId) {
    const replica = this.replicas.get(replicaId);
    if (replica) {
      replica.isHealthy = true;
    }
  }

  markUnhealthy(replicaId) {
    const replica = this.replicas.get(replicaId);
    if (replica) {
      replica.isHealthy = false;
    }
  }
}

/**
 * Query Router for Intelligent Query Distribution
 */
class QueryRouter {
  constructor(options = {}) {
    this.primaryConnection = options.primaryConnection;
    this.replicas = options.replicas;
    this.loadBalancer = options.loadBalancer;
    this.routingRules = options.routingRules || {};
  }

  route(operation, query, options = {}) {
    // Check each routing rule
    for (const [ruleName, rule] of Object.entries(this.routingRules)) {
      if (this.matchesRule(rule, operation, query, options)) {
        if (rule.target === 'primary') {
          return { target: 'primary', rule: ruleName };
        } else if (rule.target === 'replica') {
          const replicaId = rule.routingLogic ? 
            rule.routingLogic(query, options) : 
            this.loadBalancer.selectReplica();
          
          return { 
            target: 'replica', 
            replicaId, 
            rule: ruleName 
          };
        }
      }
    }

    // Default fallback
    return { target: 'primary', rule: 'default' };
  }

  matchesRule(rule, operation, query, options) {
    if (rule.operations && !rule.operations.includes(operation)) {
      return false;
    }

    if (rule.conditions) {
      return rule.conditions.some(condition => condition(query, options));
    }

    return true;
  }
}

// Export singleton instance
export const readReplicaManager = new ReadReplicaManager();
