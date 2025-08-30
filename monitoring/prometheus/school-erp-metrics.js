// monitoring/prometheus/school-erp-metrics.js - Prometheus metrics collector
import client from 'prom-client';
import { logger } from '#utils/core/logger.js';

class MetricsCollector {
  constructor() {
    // Create a Registry
    this.register = new client.Registry();
    
    // Add default metrics
    client.collectDefaultMetrics({
      register: this.register,
      prefix: 'school_erp_'
    });

    this.setupCustomMetrics();
  }

  setupCustomMetrics() {
    // HTTP request metrics
    this.httpRequestDuration = new client.Histogram({
      name: 'school_erp_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status_code', 'tenant'],
      buckets: [0.1, 0.5, 1, 2, 5]
    });

    this.httpRequestTotal = new client.Counter({
      name: 'school_erp_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status_code', 'tenant']
    });

    // Database metrics
    this.databaseConnections = new client.Gauge({
      name: 'school_erp_database_connections',
      help: 'Number of database connections',
      labelNames: ['tenant', 'status']
    });

    this.databaseQueryDuration = new client.Histogram({
      name: 'school_erp_database_query_duration_seconds',
      help: 'Database query duration in seconds',
      labelNames: ['operation', 'collection', 'tenant'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2]
    });

    // Cache metrics
    this.cacheOperations = new client.Counter({
      name: 'school_erp_cache_operations_total',
      help: 'Total cache operations',
      labelNames: ['operation', 'result']
    });

    this.cacheHitRatio = new client.Gauge({
      name: 'school_erp_cache_hit_ratio',
      help: 'Cache hit ratio'
    });

    // Business metrics
    this.activeUsers = new client.Gauge({
      name: 'school_erp_active_users',
      help: 'Number of active users',
      labelNames: ['tenant']
    });

    this.apiCalls = new client.Counter({
      name: 'school_erp_api_calls_total',
      help: 'Total API calls by endpoint',
      labelNames: ['endpoint', 'tenant', 'user_type']
    });

    // System health metrics
    this.healthCheckStatus = new client.Gauge({
      name: 'school_erp_health_check_status',
      help: 'Health check status (1 = healthy, 0 = unhealthy)',
      labelNames: ['check_name']
    });

    // Register all metrics
    this.register.registerMetric(this.httpRequestDuration);
    this.register.registerMetric(this.httpRequestTotal);
    this.register.registerMetric(this.databaseConnections);
    this.register.registerMetric(this.databaseQueryDuration);
    this.register.registerMetric(this.cacheOperations);
    this.register.registerMetric(this.cacheHitRatio);
    this.register.registerMetric(this.activeUsers);
    this.register.registerMetric(this.apiCalls);
    this.register.registerMetric(this.healthCheckStatus);
  }

  // Metric recording methods
  recordHttpRequest(method, route, statusCode, duration, tenant = 'unknown') {
    this.httpRequestDuration
      .labels(method, route, statusCode, tenant)
      .observe(duration);
    
    this.httpRequestTotal
      .labels(method, route, statusCode, tenant)
      .inc();
  }

  recordDatabaseQuery(operation, collection, duration, tenant = 'unknown') {
    this.databaseQueryDuration
      .labels(operation, collection, tenant)
      .observe(duration);
  }

  updateDatabaseConnections(tenant, status, count) {
    this.databaseConnections
      .labels(tenant, status)
      .set(count);
  }

  recordCacheOperation(operation, result) {
    this.cacheOperations
      .labels(operation, result)
      .inc();
  }

  updateCacheHitRatio(ratio) {
    this.cacheHitRatio.set(ratio);
  }

  updateActiveUsers(tenant, count) {
    this.activeUsers
      .labels(tenant)
      .set(count);
  }

  recordApiCall(endpoint, tenant, userType) {
    this.apiCalls
      .labels(endpoint, tenant, userType)
      .inc();
  }

  updateHealthCheckStatus(checkName, status) {
    this.healthCheckStatus
      .labels(checkName)
      .set(status ? 1 : 0);
  }

  // Get metrics in Prometheus format
  async getMetrics() {
    return await this.register.metrics();
  }

  // Clear all metrics
  clearMetrics() {
    this.register.clear();
  }
}

// Export singleton instance
export default new MetricsCollector();
