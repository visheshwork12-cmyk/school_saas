// scripts/monitoring/health-monitor.js - Production-ready health monitoring system
import http from 'http';
import https from 'https';
import { EventEmitter } from 'events';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import baseConfig from '#shared/config/environments/base.config.js';

/**
 * Comprehensive Health Monitoring System
 * Features:
 * - Multi-endpoint health checking
 * - Service dependency validation
 * - Performance metrics collection
 * - Alerting and notifications
 * - Custom health indicators
 * - Deployment-aware monitoring
 */
class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      interval: options.interval || 30000, // 30 seconds
      timeout: options.timeout || 5000, // 5 seconds
      retries: options.retries || 3,
      endpoints: options.endpoints || [],
      services: options.services || {},
      alertThreshold: options.alertThreshold || 3, // Failed attempts before alert
      notifications: options.notifications || {},
      ...options
    };

    this.healthState = new Map();
    this.metrics = new Map();
    this.failureCounters = new Map();
    this.isRunning = false;
    this.monitoringInterval = null;
    this.startTime = Date.now();
    
    this.setupDefaultEndpoints();
  }

  /**
   * Setup default endpoints based on environment
   */
  setupDefaultEndpoints() {
    const baseUrl = this.getBaseUrl();
    
    this.config.endpoints = [
      {
        name: 'health',
        url: `${baseUrl}/health`,
        method: 'GET',
        expected: { status: 200 },
        critical: true,
        timeout: 5000
      },
      {
        name: 'api_status',
        url: `${baseUrl}/status`,
        method: 'GET',
        expected: { status: 200 },
        critical: true,
        timeout: 3000
      },
      {
        name: 'api_docs',
        url: `${baseUrl}/api-docs.json`,
        method: 'GET',
        expected: { status: 200 },
        critical: false,
        timeout: 3000,
        enabled: baseConfig.features?.enableApiDocs
      },
      ...this.config.endpoints
    ];

    // Add service-specific endpoints
    this.setupServiceEndpoints();
  }

  /**
   * Setup service-specific health endpoints
   */
  setupServiceEndpoints() {
    if (baseConfig.features?.enableMetrics) {
      this.config.endpoints.push({
        name: 'metrics',
        url: `${this.getBaseUrl()}/metrics`,
        method: 'GET',
        expected: { status: 200 },
        critical: false,
        timeout: 5000
      });
    }

    // Add database health check
    this.config.services.database = {
      name: 'database',
      check: this.checkDatabaseHealth.bind(this),
      critical: true,
      timeout: 10000
    };

    // Add cache health check
    if (baseConfig.redis?.enabled) {
      this.config.services.cache = {
        name: 'cache',
        check: this.checkCacheHealth.bind(this),
        critical: true,
        timeout: 5000
      };
    }

    // Add external service checks
    this.setupExternalServiceChecks();
  }

  /**
   * Setup external service health checks
   */
  setupExternalServiceChecks() {
    // Email service check
    if (baseConfig.email?.smtp?.host) {
      this.config.services.email = {
        name: 'email_service',
        check: this.checkEmailServiceHealth.bind(this),
        critical: false,
        timeout: 5000
      };
    }

    // AWS services check
    if (baseConfig.aws?.region) {
      this.config.services.aws_s3 = {
        name: 'aws_s3',
        check: this.checkS3Health.bind(this),
        critical: false,
        timeout: 8000
      };
    }

    // Payment gateway checks
    if (process.env.STRIPE_SECRET_KEY) {
      this.config.services.stripe = {
        name: 'stripe',
        check: this.checkStripeHealth.bind(this),
        critical: false,
        timeout: 5000
      };
    }
  }

  /**
   * Get base URL based on deployment environment
   */
  getBaseUrl() {
    if (process.env.VERCEL_URL) {
      return `https://${process.env.VERCEL_URL}`;
    }
    
    if (process.env.API_BASE_URL) {
      return process.env.API_BASE_URL;
    }
    
    const protocol = baseConfig.security?.enableHTTPS ? 'https' : 'http';
    const port = baseConfig.port || 3000;
    const host = process.env.HOST || 'localhost';
    
    return `${protocol}://${host}:${port}`;
  }

  /**
   * Start health monitoring
   */
  start() {
    if (this.isRunning) {
      logger.warn('Health monitor is already running');
      return;
    }

    logger.info('🏥 Starting health monitoring system...', {
      interval: `${this.config.interval}ms`,
      endpoints: this.config.endpoints.length,
      services: Object.keys(this.config.services).length
    });

    this.isRunning = true;
    
    // Initial health check
    this.performHealthCheck();
    
    // Schedule periodic checks
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.config.interval);

    this.emit('started');

    // Audit log
    AuditService.log('HEALTH_MONITOR_STARTED', {
      action: 'health_monitor',
      status: 'started',
      config: {
        interval: this.config.interval,
        endpoints: this.config.endpoints.length,
        services: Object.keys(this.config.services).length
      }
    }).catch(() => {});
  }

  /**
   * Stop health monitoring
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('🛑 Stopping health monitoring system...');

    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.emit('stopped');

    // Audit log
    AuditService.log('HEALTH_MONITOR_STOPPED', {
      action: 'health_monitor',
      status: 'stopped',
      uptime: Date.now() - this.startTime
    }).catch(() => {});
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    try {
      const checkStartTime = Date.now();
      const results = {
        timestamp: new Date().toISOString(),
        overall: 'healthy',
        endpoints: {},
        services: {},
        metrics: {
          uptime: Date.now() - this.startTime,
          checkDuration: 0,
          totalChecks: 0,
          failedChecks: 0
        }
      };

      logger.debug('🔍 Performing health check...');

      // Check HTTP endpoints
      const endpointPromises = this.config.endpoints
        .filter(endpoint => endpoint.enabled !== false)
        .map(endpoint => this.checkEndpoint(endpoint));

      const endpointResults = await Promise.allSettled(endpointPromises);
      
      endpointResults.forEach((result, index) => {
        const endpoint = this.config.endpoints[index];
        if (result.status === 'fulfilled') {
          results.endpoints[endpoint.name] = result.value;
        } else {
          results.endpoints[endpoint.name] = {
            status: 'unhealthy',
            error: result.reason.message,
            critical: endpoint.critical
          };
        }
      });

      // Check services
      const servicePromises = Object.values(this.config.services)
        .map(service => this.checkService(service));

      const serviceResults = await Promise.allSettled(servicePromises);
      
      serviceResults.forEach((result, index) => {
        const service = Object.values(this.config.services)[index];
        if (result.status === 'fulfilled') {
          results.services[service.name] = result.value;
        } else {
          results.services[service.name] = {
            status: 'unhealthy',
            error: result.reason.message,
            critical: service.critical
          };
        }
      });

      // Calculate overall health
      results.overall = this.calculateOverallHealth(results);
      results.metrics.checkDuration = Date.now() - checkStartTime;
      results.metrics.totalChecks = Object.keys(results.endpoints).length + Object.keys(results.services).length;
      results.metrics.failedChecks = this.countFailedChecks(results);

      // Update health state
      this.updateHealthState(results);

      // Handle alerts
      await this.handleAlerts(results);

      // Emit health check event
      this.emit('health_check', results);

      logger.debug('✅ Health check completed', {
        overall: results.overall,
        duration: `${results.metrics.checkDuration}ms`,
        failed: results.metrics.failedChecks
      });

    } catch (error) {
      logger.error('❌ Health check failed:', {
        error: error.message,
        stack: error.stack
      });

      this.emit('health_check_error', error);
    }
  }

  /**
   * Check individual HTTP endpoint
   */
  async checkEndpoint(endpoint) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const url = new URL(endpoint.url);
      const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + url.search,
        method: endpoint.method || 'GET',
        timeout: endpoint.timeout || this.config.timeout,
        headers: {
          'User-Agent': 'HealthMonitor/1.0',
          ...endpoint.headers
        }
      };

      const client = url.protocol === 'https:' ? https : http;
      
      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          const duration = Date.now() - startTime;
          const result = {
            status: 'healthy',
            statusCode: res.statusCode,
            responseTime: duration,
            timestamp: new Date().toISOString()
          };

          // Validate response
          if (endpoint.expected) {
            if (endpoint.expected.status && res.statusCode !== endpoint.expected.status) {
              result.status = 'unhealthy';
              result.error = `Expected status ${endpoint.expected.status}, got ${res.statusCode}`;
            }

            if (endpoint.expected.contains && !data.includes(endpoint.expected.contains)) {
              result.status = 'unhealthy';
              result.error = `Response does not contain expected content`;
            }
          }

          resolve(result);
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Endpoint ${endpoint.name} check failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Endpoint ${endpoint.name} check timed out`));
      });

      if (endpoint.body) {
        req.write(JSON.stringify(endpoint.body));
      }

      req.end();
    });
  }

  /**
   * Check service health
   */
  async checkService(service) {
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        service.check(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Service check timeout')), service.timeout)
        )
      ]);

      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        ...result
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Database health check
   */
  async checkDatabaseHealth() {
    try {
      const { dbManager } = await import('#shared/database/connection-manager.js');
      const health = dbManager.getAllConnectionsHealth();
      
      const unhealthyConnections = Object.entries(health)
        .filter(([_, status]) => !status.healthy);

      if (unhealthyConnections.length > 0) {
        throw new Error(`Unhealthy database connections: ${unhealthyConnections.map(([name]) => name).join(', ')}`);
      }

      return {
        connections: Object.keys(health).length,
        details: health
      };

    } catch (error) {
      throw new Error(`Database health check failed: ${error.message}`);
    }
  }

  /**
   * Cache health check
   */
  async checkCacheHealth() {
    try {
      const { CacheService } = await import('#core/cache/services/unified-cache.service.js');
      const health = await CacheService.healthCheck();
      
      if (!health.healthy) {
        throw new Error(health.error || 'Cache is unhealthy');
      }

      return health;

    } catch (error) {
      throw new Error(`Cache health check failed: ${error.message}`);
    }
  }

  /**
   * Email service health check
   */
  async checkEmailServiceHealth() {
    try {
      // Simple SMTP connection test
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransporter({
        host: baseConfig.email.smtp.host,
        port: baseConfig.email.smtp.port,
        secure: baseConfig.email.smtp.secure,
        auth: {
          user: baseConfig.email.smtp.user,
          pass: baseConfig.email.smtp.pass
        }
      });

      await transporter.verify();
      
      return {
        smtp: 'connected',
        host: baseConfig.email.smtp.host
      };

    } catch (error) {
      throw new Error(`Email service health check failed: ${error.message}`);
    }
  }

  /**
   * AWS S3 health check
   */
  async checkS3Health() {
    try {
      const AWS = await import('aws-sdk');
      const s3 = new AWS.S3({
        region: baseConfig.aws.region
      });

      await s3.headBucket({
        Bucket: baseConfig.aws.s3.bucket
      }).promise();

      return {
        bucket: baseConfig.aws.s3.bucket,
        region: baseConfig.aws.region
      };

    } catch (error) {
      throw new Error(`S3 health check failed: ${error.message}`);
    }
  }

  /**
   * Stripe health check
   */
  async checkStripeHealth() {
    try {
      const stripe = await import('stripe');
      const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);
      
      await stripeClient.accounts.retrieve();
      
      return {
        service: 'stripe',
        status: 'connected'
      };

    } catch (error) {
      throw new Error(`Stripe health check failed: ${error.message}`);
    }
  }

  /**
   * Calculate overall health status
   */
  calculateOverallHealth(results) {
    const criticalFailures = [
      ...Object.values(results.endpoints).filter(r => r.critical && r.status === 'unhealthy'),
      ...Object.values(results.services).filter(r => r.critical && r.status === 'unhealthy')
    ];

    if (criticalFailures.length > 0) {
      return 'unhealthy';
    }

    const anyFailures = [
      ...Object.values(results.endpoints).filter(r => r.status === 'unhealthy'),
      ...Object.values(results.services).filter(r => r.status === 'unhealthy')
    ];

    if (anyFailures.length > 0) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Count failed checks
   */
  countFailedChecks(results) {
    return [
      ...Object.values(results.endpoints),
      ...Object.values(results.services)
    ].filter(r => r.status === 'unhealthy').length;
  }

  /**
   * Update health state tracking
   */
  updateHealthState(results) {
    const currentState = {
      timestamp: results.timestamp,
      overall: results.overall,
      failures: results.metrics.failedChecks
    };

    this.healthState.set('current', currentState);
    
    // Update metrics
    this.updateMetrics(results);
  }

  /**
   * Update monitoring metrics
   */
  updateMetrics(results) {
    const metrics = this.metrics.get('summary') || {
      totalChecks: 0,
      healthyChecks: 0,
      unhealthyChecks: 0,
      avgResponseTime: 0,
      uptimePercentage: 100
    };

    metrics.totalChecks++;
    
    if (results.overall === 'healthy') {
      metrics.healthyChecks++;
    } else {
      metrics.unhealthyChecks++;
    }

    metrics.uptimePercentage = (metrics.healthyChecks / metrics.totalChecks) * 100;
    
    // Calculate average response time
    const responseTimes = [
      ...Object.values(results.endpoints).map(e => e.responseTime || 0),
      ...Object.values(results.services).map(s => s.responseTime || 0)
    ].filter(t => t > 0);

    if (responseTimes.length > 0) {
      const avgTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      metrics.avgResponseTime = Math.round((metrics.avgResponseTime + avgTime) / 2);
    }

    this.metrics.set('summary', metrics);
  }

  /**
   * Handle alerts and notifications
   */
  async handleAlerts(results) {
    if (results.overall === 'healthy') {
      // Clear failure counters on successful check
      this.failureCounters.clear();
      return;
    }

    // Track consecutive failures
    const currentFailures = (this.failureCounters.get('consecutive') || 0) + 1;
    this.failureCounters.set('consecutive', currentFailures);

    // Send alert if threshold reached
    if (currentFailures >= this.config.alertThreshold) {
      await this.sendAlert(results, currentFailures);
    }
  }

  /**
   * Send health alert
   */
  async sendAlert(results, failureCount) {
    const alertData = {
      timestamp: new Date().toISOString(),
      severity: results.overall === 'unhealthy' ? 'critical' : 'warning',
      consecutiveFailures: failureCount,
      failedChecks: results.metrics.failedChecks,
      environment: baseConfig.env,
      deployment: process.env.VERCEL ? 'vercel' : 'traditional'
    };

    logger.error('🚨 Health alert triggered', alertData);

    // Emit alert event
    this.emit('alert', alertData);

    // Send notifications if configured
    await this.sendNotifications(alertData);

    // Audit log
    AuditService.log('HEALTH_ALERT_TRIGGERED', {
      action: 'health_alert',
      ...alertData
    }).catch(() => {});
  }

  /**
   * Send notifications
   */
  async sendNotifications(alertData) {
    try {
      // Webhook notification
      if (this.config.notifications.webhook) {
        await this.sendWebhookNotification(alertData);
      }

      // Email notification
      if (this.config.notifications.email) {
        await this.sendEmailNotification(alertData);
      }

      // Slack notification
      if (this.config.notifications.slack) {
        await this.sendSlackNotification(alertData);
      }

    } catch (error) {
      logger.error('Failed to send health alert notifications:', error);
    }
  }

  /**
   * Send webhook notification
   */
  async sendWebhookNotification(alertData) {
    const response = await fetch(this.config.notifications.webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        alert: 'Health Monitor Alert',
        ...alertData
      })
    });

    if (!response.ok) {
      throw new Error(`Webhook notification failed: ${response.statusText}`);
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus() {
    return {
      isRunning: this.isRunning,
      uptime: Date.now() - this.startTime,
      lastCheck: this.healthState.get('current'),
      metrics: this.metrics.get('summary'),
      failureCount: this.failureCounters.get('consecutive') || 0
    };
  }

  /**
   * Get detailed health report
   */
  generateHealthReport() {
    const status = this.getHealthStatus();
    const report = {
      timestamp: new Date().toISOString(),
      monitor: {
        status: this.isRunning ? 'running' : 'stopped',
        uptime: status.uptime,
        configuration: {
          interval: this.config.interval,
          timeout: this.config.timeout,
          endpoints: this.config.endpoints.length,
          services: Object.keys(this.config.services).length
        }
      },
      health: status.lastCheck || { overall: 'unknown' },
      metrics: status.metrics || {},
      alerts: {
        consecutiveFailures: status.failureCount,
        threshold: this.config.alertThreshold
      }
    };

    return report;
  }
}

// Create and export default health monitor instance
const healthMonitor = new HealthMonitor({
  interval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
  timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT) || 5000,
  retries: parseInt(process.env.HEALTH_CHECK_RETRIES) || 3,
  alertThreshold: parseInt(process.env.HEALTH_ALERT_THRESHOLD) || 3,
  notifications: {
    webhook: process.env.HEALTH_WEBHOOK_URL,
    email: process.env.HEALTH_ALERT_EMAIL,
    slack: process.env.HEALTH_SLACK_WEBHOOK
  }
});

// Auto-start in non-test environments
if (process.env.NODE_ENV !== 'test' && process.env.DISABLE_HEALTH_MONITOR !== 'true') {
  healthMonitor.start();

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('Shutting down health monitor...');
    healthMonitor.stop();
  });

  process.on('SIGINT', () => {
    logger.info('Shutting down health monitor...');
    healthMonitor.stop();
  });
}

export default healthMonitor;
export { HealthMonitor };
