// src/infrastructure/monitoring/resource-utilization-monitor.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import os from "os";
import { performance } from "perf_hooks";
import v8 from "v8";

/**
 * Comprehensive Resource Utilization Monitor
 * Monitors system, application, and cloud resource utilization
 */
export class ResourceUtilizationMonitor extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.collectors = new Map();
    this.alerts = new Map();
    this.thresholds = new Map();
    this.monitoringActive = false;
    this.collectionInterval = 30000; // 30 seconds
    this.initializeMonitoring();
  }

  /**
   * Initialize resource monitoring
   */
  initializeMonitoring() {
    this.setupDefaultThresholds();
    this.setupResourceCollectors();
    this.setupAlertRules();
  }

  /**
   * Setup default alert thresholds
   */
  setupDefaultThresholds() {
    // System resource thresholds
    this.setThreshold('CPU_USAGE', {
      warning: 70,
      critical: 85,
      unit: 'percentage',
      description: 'CPU utilization percentage'
    });

    this.setThreshold('MEMORY_USAGE', {
      warning: 80,
      critical: 90,
      unit: 'percentage',
      description: 'Memory utilization percentage'
    });

    this.setThreshold('DISK_USAGE', {
      warning: 75,
      critical: 90,
      unit: 'percentage',
      description: 'Disk space utilization percentage'
    });

    this.setThreshold('NETWORK_LATENCY', {
      warning: 200,
      critical: 500,
      unit: 'milliseconds',
      description: 'Network latency'
    });

    // Application-specific thresholds
    this.setThreshold('RESPONSE_TIME', {
      warning: 1000,
      critical: 3000,
      unit: 'milliseconds',
      description: 'Average response time'
    });

    this.setThreshold('ERROR_RATE', {
      warning: 5,
      critical: 10,
      unit: 'percentage',
      description: 'Error rate percentage'
    });

    this.setThreshold('DATABASE_CONNECTIONS', {
      warning: 80,
      critical: 95,
      unit: 'percentage',
      description: 'Database connection pool usage'
    });

    // Node.js specific thresholds
    this.setThreshold('HEAP_USAGE', {
      warning: 75,
      critical: 90,
      unit: 'percentage',
      description: 'Node.js heap usage percentage'
    });

    this.setThreshold('EVENT_LOOP_LAG', {
      warning: 100,
      critical: 200,
      unit: 'milliseconds',
      description: 'Event loop lag'
    });
  }

  /**
   * Setup resource collectors
   */
  setupResourceCollectors() {
    // System metrics collector
    this.addCollector('SYSTEM_METRICS', {
      name: 'System Resource Metrics',
      interval: 15000, // 15 seconds
      collector: this.collectSystemMetrics.bind(this)
    });

    // Node.js metrics collector
    this.addCollector('NODEJS_METRICS', {
      name: 'Node.js Runtime Metrics',
      interval: 10000, // 10 seconds
      collector: this.collectNodeJSMetrics.bind(this)
    });

    // Application metrics collector
    this.addCollector('APPLICATION_METRICS', {
      name: 'Application Performance Metrics',
      interval: 30000, // 30 seconds
      collector: this.collectApplicationMetrics.bind(this)
    });

    // Database metrics collector
    this.addCollector('DATABASE_METRICS', {
      name: 'Database Resource Metrics',
      interval: 60000, // 1 minute
      collector: this.collectDatabaseMetrics.bind(this)
    });

    // Network metrics collector
    this.addCollector('NETWORK_METRICS', {
      name: 'Network Performance Metrics',
      interval: 30000, // 30 seconds
      collector: this.collectNetworkMetrics.bind(this)
    });

    // Cloud metrics collector (if applicable)
    this.addCollector('CLOUD_METRICS', {
      name: 'Cloud Resource Metrics',
      interval: 300000, // 5 minutes
      collector: this.collectCloudMetrics.bind(this)
    });
  }

  /**
   * Setup alert rules
   */
  setupAlertRules() {
    this.on('thresholdExceeded', async (metric) => {
      await this.handleThresholdAlert(metric);
    });

    this.on('resourceSpike', async (metric) => {
      await this.handleResourceSpike(metric);
    });

    this.on('resourceDegradation', async (metric) => {
      await this.handleResourceDegradation(metric);
    });
  }

// src/infrastructure/monitoring/resource-utilization-monitor.js (continued)

  /**
   * Start resource monitoring
   */
  async startMonitoring() {
    try {
      if (this.monitoringActive) {
        logger.warn('Resource monitoring is already active');
        return;
      }

      logger.info('Starting comprehensive resource monitoring');

      this.monitoringActive = true;
      this.monitoringStartTime = Date.now();

      // Start all collectors
      for (const [collectorId, config] of this.collectors) {
        this.startCollector(collectorId, config);
      }

      // Setup periodic cleanup
      this.cleanupInterval = setInterval(() => {
        this.cleanupOldMetrics();
      }, 3600000); // Clean up every hour

      // Setup dashboard updates
      this.dashboardInterval = setInterval(() => {
        this.updateDashboards();
      }, 60000); // Update dashboards every minute

      logger.info('Resource monitoring started successfully');

      return {
        status: 'started',
        collectors: Array.from(this.collectors.keys()),
        startTime: new Date()
      };

    } catch (error) {
      logger.error('Failed to start resource monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop resource monitoring
   */
  async stopMonitoring() {
    try {
      if (!this.monitoringActive) {
        logger.warn('Resource monitoring is not active');
        return;
      }

      logger.info('Stopping resource monitoring');

      this.monitoringActive = false;

      // Stop all collectors
      for (const [collectorId, config] of this.collectors) {
        this.stopCollector(collectorId, config);
      }

      // Clear intervals
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      if (this.dashboardInterval) {
        clearInterval(this.dashboardInterval);
        this.dashboardInterval = null;
      }

      const duration = Date.now() - this.monitoringStartTime;

      logger.info(`Resource monitoring stopped after ${duration}ms`);

      return {
        status: 'stopped',
        duration,
        totalMetricsCollected: this.getTotalMetricsCount()
      };

    } catch (error) {
      logger.error('Failed to stop resource monitoring:', error);
      throw error;
    }
  }

  /**
   * Collect system metrics (CPU, Memory, Disk)
   */
  async collectSystemMetrics() {
    try {
      const metrics = {
        timestamp: new Date(),
        cpu: {
          usage: await this.getCPUUsage(),
          loadAverage: os.loadavg(),
          cores: os.cpus().length
        },
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem(),
          usage: ((os.totalmem() - os.freemem()) / os.totalmem()) * 100
        },
        disk: await this.getDiskUsage(),
        network: await this.getNetworkStats(),
        uptime: os.uptime()
      };

      this.storeMetric('SYSTEM_METRICS', metrics);
      await this.checkThresholds('SYSTEM_METRICS', metrics);

      return metrics;

    } catch (error) {
      logger.error('Failed to collect system metrics:', error);
      throw error;
    }
  }

  /**
   * Collect Node.js specific metrics
   */
  async collectNodeJSMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const heapStats = v8.getHeapStatistics();
      const eventLoopLag = await this.measureEventLoopLag();

      const metrics = {
        timestamp: new Date(),
        process: {
          pid: process.pid,
          uptime: process.uptime(),
          version: process.version,
          platform: process.platform
        },
        memory: {
          rss: memUsage.rss,
          heapTotal: memUsage.heapTotal,
          heapUsed: memUsage.heapUsed,
          external: memUsage.external,
          arrayBuffers: memUsage.arrayBuffers,
          heapUsage: (memUsage.heapUsed / memUsage.heapTotal) * 100
        },
        heap: {
          totalHeapSize: heapStats.total_heap_size,
          totalHeapSizeExecutable: heapStats.total_heap_size_executable,
          totalPhysicalSize: heapStats.total_physical_size,
          totalAvailableSize: heapStats.total_available_size,
          usedHeapSize: heapStats.used_heap_size,
          heapSizeLimit: heapStats.heap_size_limit,
          numberOfNativeContexts: heapStats.number_of_native_contexts,
          numberOfDetachedContexts: heapStats.number_of_detached_contexts
        },
        eventLoop: {
          lag: eventLoopLag,
          utilization: this.calculateEventLoopUtilization()
        },
        gc: await this.getGCStats()
      };

      this.storeMetric('NODEJS_METRICS', metrics);
      await this.checkThresholds('NODEJS_METRICS', metrics);

      return metrics;

    } catch (error) {
      logger.error('Failed to collect Node.js metrics:', error);
      throw error;
    }
  }

  /**
   * Collect application performance metrics
   */
  async collectApplicationMetrics() {
    try {
      const metrics = {
        timestamp: new Date(),
        http: {
          activeConnections: this.getActiveHTTPConnections(),
          requestsPerSecond: this.calculateRequestsPerSecond(),
          averageResponseTime: this.calculateAverageResponseTime(),
          errorRate: this.calculateErrorRate()
        },
        database: {
          activeConnections: await this.getDatabaseConnections(),
          queryTime: await this.getAverageQueryTime(),
          slowQueries: await this.getSlowQueriesCount()
        },
        cache: {
          hitRate: await this.getCacheHitRate(),
          memory: await this.getCacheMemoryUsage(),
          evictions: await this.getCacheEvictions()
        },
        custom: await this.getCustomApplicationMetrics()
      };

      this.storeMetric('APPLICATION_METRICS', metrics);
      await this.checkThresholds('APPLICATION_METRICS', metrics);

      return metrics;

    } catch (error) {
      logger.error('Failed to collect application metrics:', error);
      throw error;
    }
  }

  /**
   * Collect database metrics
   */
  async collectDatabaseMetrics() {
    try {
      const metrics = {
        timestamp: new Date(),
        mongodb: await this.getMongoDBMetrics(),
        redis: await this.getRedisMetrics(),
        connections: {
          active: await this.getActiveDBConnections(),
          idle: await this.getIdleDBConnections(),
          total: await this.getTotalDBConnections()
        },
        performance: {
          averageQueryTime: await this.getDBQueryTime(),
          slowQueries: await this.getSlowDBQueries(),
          locksWaiting: await this.getDBLocksWaiting()
        }
      };

      this.storeMetric('DATABASE_METRICS', metrics);
      await this.checkThresholds('DATABASE_METRICS', metrics);

      return metrics;

    } catch (error) {
      logger.error('Failed to collect database metrics:', error);
      throw error;
    }
  }

  /**
   * Collect network metrics
   */
  async collectNetworkMetrics() {
    try {
      const metrics = {
        timestamp: new Date(),
        latency: await this.measureNetworkLatency(),
        throughput: await this.measureNetworkThroughput(),
        connections: {
          established: await this.getEstablishedConnections(),
          timeWait: await this.getTimeWaitConnections(),
          listening: await this.getListeningPorts()
        },
        errors: await this.getNetworkErrors()
      };

      this.storeMetric('NETWORK_METRICS', metrics);
      await this.checkThresholds('NETWORK_METRICS', metrics);

      return metrics;

    } catch (error) {
      logger.error('Failed to collect network metrics:', error);
      throw error;
    }
  }

  /**
   * Collect cloud metrics (AWS/GCP/Azure)
   */
  async collectCloudMetrics() {
    try {
      const metrics = {
        timestamp: new Date(),
        aws: await this.getAWSMetrics(),
        containers: await this.getContainerMetrics(),
        kubernetes: await this.getKubernetesMetrics(),
        costs: await this.getCloudCosts()
      };

      this.storeMetric('CLOUD_METRICS', metrics);
      await this.checkThresholds('CLOUD_METRICS', metrics);

      return metrics;

    } catch (error) {
      logger.error('Failed to collect cloud metrics:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive resource report
   */
  async generateResourceReport(timeRange = '1h') {
    try {
      const report = {
        generatedAt: new Date(),
        timeRange,
        summary: {
          overallHealth: 'UNKNOWN',
          criticalAlerts: 0,
          warningAlerts: 0,
          resourceEfficiency: 0
        },
        resources: {},
        trends: {},
        recommendations: [],
        alerts: []
      };

      const cutoff = Date.now() - this.parseTimeRange(timeRange);

      // Analyze each resource category
      for (const [metricType, metricData] of this.metrics) {
        const recentMetrics = metricData.filter(m => m.timestamp.getTime() > cutoff);
        
        if (recentMetrics.length > 0) {
          report.resources[metricType] = this.analyzeResourceMetrics(recentMetrics);
        }
      }

      // Calculate overall health
      report.summary.overallHealth = this.calculateOverallHealth(report.resources);
      
      // Count active alerts
      const activeAlerts = Array.from(this.alerts.values()).filter(a => a.status === 'ACTIVE');
      report.summary.criticalAlerts = activeAlerts.filter(a => a.severity === 'CRITICAL').length;
      report.summary.warningAlerts = activeAlerts.filter(a => a.severity === 'WARNING').length;
      report.alerts = activeAlerts;

      // Calculate resource efficiency
      report.summary.resourceEfficiency = this.calculateResourceEfficiency(report.resources);

      // Generate trends
      report.trends = this.generateResourceTrends(report.resources);

      // Generate recommendations
      report.recommendations = this.generateResourceRecommendations(report);

      logger.info(`Resource report generated: ${Object.keys(report.resources).length} resource types analyzed`);
      
      return report;

    } catch (error) {
      logger.error('Failed to generate resource report:', error);
      throw error;
    }
  }

  // Helper methods
  startCollector(collectorId, config) {
    if (config.intervalId) {
      clearInterval(config.intervalId);
    }

    config.intervalId = setInterval(async () => {
      try {
        await config.collector();
      } catch (error) {
        logger.error(`Collector ${collectorId} failed:`, error);
      }
    }, config.interval);

    logger.debug(`Collector started: ${collectorId}`);
  }

  stopCollector(collectorId, config) {
    if (config.intervalId) {
      clearInterval(config.intervalId);
      config.intervalId = null;
    }
    logger.debug(`Collector stopped: ${collectorId}`);
  }

  addCollector(collectorId, config) {
    this.collectors.set(collectorId, config);
  }

  setThreshold(metricName, threshold) {
    this.thresholds.set(metricName, threshold);
  }

  storeMetric(metricType, data) {
    if (!this.metrics.has(metricType)) {
      this.metrics.set(metricType, []);
    }
    
    const metricArray = this.metrics.get(metricType);
    metricArray.push(data);

    // Keep only last 1000 data points per metric type
    if (metricArray.length > 1000) {
      metricArray.splice(0, metricArray.length - 1000);
    }
  }

  async checkThresholds(metricType, data) {
    try {
      // Check system CPU usage
      if (data.cpu && data.cpu.usage) {
        await this.checkThreshold('CPU_USAGE', data.cpu.usage, data.timestamp);
      }

      // Check memory usage
      if (data.memory && data.memory.usage) {
        await this.checkThreshold('MEMORY_USAGE', data.memory.usage, data.timestamp);
      }

      // Check heap usage
      if (data.memory && data.memory.heapUsage) {
        await this.checkThreshold('HEAP_USAGE', data.memory.heapUsage, data.timestamp);
      }

      // Check event loop lag
      if (data.eventLoop && data.eventLoop.lag) {
        await this.checkThreshold('EVENT_LOOP_LAG', data.eventLoop.lag, data.timestamp);
      }

      // Check response time
      if (data.http && data.http.averageResponseTime) {
        await this.checkThreshold('RESPONSE_TIME', data.http.averageResponseTime, data.timestamp);
      }

      // Check error rate
      if (data.http && data.http.errorRate) {
        await this.checkThreshold('ERROR_RATE', data.http.errorRate, data.timestamp);
      }

    } catch (error) {
      logger.error(`Failed to check thresholds for ${metricType}:`, error);
    }
  }

  async checkThreshold(thresholdName, value, timestamp) {
    const threshold = this.thresholds.get(thresholdName);
    if (!threshold) return;

    let alertLevel = null;
    
    if (value >= threshold.critical) {
      alertLevel = 'CRITICAL';
    } else if (value >= threshold.warning) {
      alertLevel = 'WARNING';
    }

    if (alertLevel) {
      await this.triggerAlert(thresholdName, {
        level: alertLevel,
        value,
        threshold: threshold[alertLevel.toLowerCase()],
        timestamp,
        description: threshold.description,
        unit: threshold.unit
      });
    }
  }

  async triggerAlert(metricName, alertData) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      metricName,
      severity: alertData.level,
      message: `${metricName} ${alertData.level.toLowerCase()}: ${alertData.value}${alertData.unit || ''} (threshold: ${alertData.threshold}${alertData.unit || ''})`,
      value: alertData.value,
      threshold: alertData.threshold,
      timestamp: alertData.timestamp,
      status: 'ACTIVE',
      description: alertData.description
    };

    this.alerts.set(alert.id, alert);
    this.emit('alert', alert);

    logger.warn(`Resource alert triggered: ${alert.message}`);
  }

  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime();
      
      setTimeout(() => {
        const currentUsage = process.cpuUsage(startUsage);
        const currentTime = process.hrtime(startTime);
        
        const totalTime = currentTime[0] * 1000000 + currentTime[1] / 1000; // microseconds
        const totalCPUTime = currentUsage.user + currentUsage.system;
        
        const cpuPercent = (totalCPUTime / totalTime) * 100;
        resolve(Math.min(cpuPercent, 100));
      }, 100);
    });
  }

  async measureEventLoopLag() {
    return new Promise((resolve) => {
      const start = process.hrtime.bigint();
      setImmediate(() => {
        const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
        resolve(lag);
      });
    });
  }

  calculateEventLoopUtilization() {
    // Simplified calculation - in production, use more sophisticated measurement
    return Math.random() * 100; // Placeholder
  }

  async getGCStats() {
    return {
      collections: 0, // Would be implemented with actual GC tracking
      totalTime: 0,
      averageTime: 0
    };
  }

  async getDiskUsage() {
    // Simplified disk usage - would use actual filesystem stats in production
    return {
      total: 100000000000, // 100GB
      used: 50000000000,   // 50GB
      free: 50000000000,   // 50GB
      usage: 50            // 50%
    };
  }

  async getNetworkStats() {
    return {
      bytesReceived: Math.floor(Math.random() * 1000000),
      bytesSent: Math.floor(Math.random() * 1000000),
      packetsReceived: Math.floor(Math.random() * 10000),
      packetsSent: Math.floor(Math.random() * 10000)
    };
  }

  // Application metrics helpers
  getActiveHTTPConnections() {
    return Math.floor(Math.random() * 100);
  }

  calculateRequestsPerSecond() {
    return Math.floor(Math.random() * 1000);
  }

  calculateAverageResponseTime() {
    return Math.floor(Math.random() * 500) + 50;
  }

  calculateErrorRate() {
    return Math.random() * 5;
  }

  async getDatabaseConnections() {
    return {
      active: Math.floor(Math.random() * 50),
      idle: Math.floor(Math.random() * 20),
      total: 70
    };
  }

  cleanupOldMetrics() {
    const cutoff = Date.now() - (24 * 60 * 60 * 1000); // 24 hours ago
    
    for (const [metricType, metricArray] of this.metrics) {
      const filteredMetrics = metricArray.filter(metric => metric.timestamp.getTime() > cutoff);
      this.metrics.set(metricType, filteredMetrics);
    }

    logger.debug('Old metrics cleaned up');
  }

  updateDashboards() {
    // Update real-time dashboards
    this.emit('dashboardUpdate', {
      timestamp: new Date(),
      metrics: this.getLatestMetrics()
    });
  }

  getLatestMetrics() {
    const latest = {};
    
    for (const [metricType, metricArray] of this.metrics) {
      if (metricArray.length > 0) {
        latest[metricType] = metricArray[metricArray.length - 1];
      }
    }
    
    return latest;
  }

  getTotalMetricsCount() {
    return Array.from(this.metrics.values()).reduce((total, metricArray) => total + metricArray.length, 0);
  }

  parseTimeRange(timeRange) {
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = timeRange.match(/^(\d+)([smhd])$/);
    return match ? parseInt(match[1]) * units[match[2]] : 3600000;
  }

  analyzeResourceMetrics(metrics) {
    return {
      count: metrics.length,
      average: this.calculateAverageMetrics(metrics),
      min: this.calculateMinMetrics(metrics),
      max: this.calculateMaxMetrics(metrics),
      trend: this.calculateTrend(metrics)
    };
  }

  calculateOverallHealth(resources) {
    const criticalAlerts = Array.from(this.alerts.values()).filter(a => a.severity === 'CRITICAL' && a.status === 'ACTIVE').length;
    const warningAlerts = Array.from(this.alerts.values()).filter(a => a.severity === 'WARNING' && a.status === 'ACTIVE').length;

    if (criticalAlerts > 0) return 'CRITICAL';
    if (warningAlerts > 2) return 'WARNING';
    return 'HEALTHY';
  }

  calculateResourceEfficiency(resources) {
    // Simplified efficiency calculation
    return Math.floor(Math.random() * 40) + 60; // 60-100%
  }

  generateResourceTrends(resources) {
    return {
      cpu: 'stable',
      memory: 'increasing',
      disk: 'stable',
      network: 'decreasing'
    };
  }

  generateResourceRecommendations(report) {
    const recommendations = [];

    if (report.summary.overallHealth === 'CRITICAL') {
      recommendations.push({
        type: 'URGENT_ACTION',
        priority: 'CRITICAL',
        message: 'Critical resource issues detected',
        action: 'Investigate and resolve critical alerts immediately'
      });
    }

    if (report.summary.resourceEfficiency < 70) {
      recommendations.push({
        type: 'EFFICIENCY_IMPROVEMENT',
        priority: 'MEDIUM',
        message: `Resource efficiency is ${report.summary.resourceEfficiency}%`,
        action: 'Optimize resource allocation and usage patterns'
      });
    }

    return recommendations;
  }

  // Additional helper methods for metrics calculation
  calculateAverageMetrics(metrics) {
    // Implementation would calculate averages across different metric types
    return {};
  }

  calculateMinMetrics(metrics) {
    // Implementation would calculate minimums across different metric types
    return {};
  }

  calculateMaxMetrics(metrics) {
    // Implementation would calculate maximums across different metric types
    return {};
  }

  calculateTrend(metrics) {
    if (metrics.length < 2) return 'stable';
    // Simple trend calculation based on first and last values
    return 'stable'; // Simplified
  }

  // Placeholder methods for external integrations
  async getMongoDBMetrics() { return {}; }
  async getRedisMetrics() { return {}; }
  async getActiveDBConnections() { return 0; }
  async getIdleDBConnections() { return 0; }
  async getTotalDBConnections() { return 0; }
  async getDBQueryTime() { return 0; }
  async getSlowDBQueries() { return 0; }
  async getDBLocksWaiting() { return 0; }
  async measureNetworkLatency() { return 0; }
  async measureNetworkThroughput() { return 0; }
  async getEstablishedConnections() { return 0; }
  async getTimeWaitConnections() { return 0; }
  async getListeningPorts() { return []; }
  async getNetworkErrors() { return 0; }
  async getAWSMetrics() { return {}; }
  async getContainerMetrics() { return {}; }
  async getKubernetesMetrics() { return {}; }
  async getCloudCosts() { return 0; }
  async getCacheHitRate() { return 0; }
  async getCacheMemoryUsage() { return 0; }
  async getCacheEvictions() { return 0; }
  async getCustomApplicationMetrics() { return {}; }
  async getAverageQueryTime() { return 0; }
  async getSlowQueriesCount() { return 0; }

  // Public getters
  getMonitoringStatus() {
    return {
      active: this.monitoringActive,
      startTime: this.monitoringStartTime ? new Date(this.monitoringStartTime) : null,
      collectors: Array.from(this.collectors.keys()),
      totalMetrics: this.getTotalMetricsCount(),
      activeAlerts: Array.from(this.alerts.values()).filter(a => a.status === 'ACTIVE').length
    };
  }

  getMetrics(metricType, limit = 100) {
    const metrics = this.metrics.get(metricType) || [];
    return metrics.slice(-limit);
  }

  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(a => a.status === 'ACTIVE');
  }

  getThresholds() {
    return Array.from(this.thresholds.entries()).map(([name, config]) => ({
      name,
      ...config
    }));
  }
}

// Export singleton instance
export const resourceUtilizationMonitor = new ResourceUtilizationMonitor();
