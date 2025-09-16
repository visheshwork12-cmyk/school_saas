// src/core/monitoring/services/cloudwatch.service.js
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogsClient, CreateLogGroupCommand, PutLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';

class CloudWatchService {
  constructor() {
    this.cloudWatchClient = new CloudWatchClient({
      region: baseConfig.aws?.region || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    
    this.cloudWatchLogsClient = new CloudWatchLogsClient({
      region: baseConfig.aws?.region || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    this.namespace = 'SchoolERP/Application';
    this.environment = baseConfig.env;
    this.metricsBuffer = [];
    this.flushInterval = 60000; // 1 minute
    this.maxBatchSize = 20;
    
    this.initializeMetricsFlush();
  }

  /**
   * Initialize periodic metrics flushing
   */
  initializeMetricsFlush() {
    setInterval(() => {
      this.flushMetrics();
    }, this.flushInterval);
  }

  /**
   * Put custom application metrics to CloudWatch
   */
  async putMetricData(metricName, value, unit = 'Count', dimensions = []) {
    try {
      const defaultDimensions = [
        { Name: 'Environment', Value: this.environment },
        { Name: 'Service', Value: 'API' },
        ...dimensions,
      ];

      const metricData = {
        MetricName: metricName,
        Dimensions: defaultDimensions,
        Value: parseFloat(value),
        Unit: unit,
        Timestamp: new Date(),
      };

      // Buffer metrics for batch sending
      this.metricsBuffer.push(metricData);

      // Flush if buffer is full
      if (this.metricsBuffer.length >= this.maxBatchSize) {
        await this.flushMetrics();
      }

      logger.debug('CloudWatch metric queued', { metricName, value, unit });
    } catch (error) {
      logger.error('Failed to queue CloudWatch metric', {
        error: error.message,
        metricName,
        value,
      });
    }
  }

  /**
   * Flush buffered metrics to CloudWatch
   */
  async flushMetrics() {
    if (this.metricsBuffer.length === 0) return;

    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [...this.metricsBuffer],
      });

      await this.cloudWatchClient.send(command);
      
      const metricCount = this.metricsBuffer.length;
      this.metricsBuffer = [];
      
      logger.debug('CloudWatch metrics flushed successfully', { metricCount });
    } catch (error) {
      logger.error('Failed to flush CloudWatch metrics', {
        error: error.message,
        bufferSize: this.metricsBuffer.length,
      });
      
      // Clear buffer on persistent errors to prevent memory leaks
      if (this.metricsBuffer.length > 100) {
        this.metricsBuffer = [];
      }
    }
  }

  /**
   * Track API response time metrics
   */
  async trackResponseTime(endpoint, responseTime, statusCode, tenantId) {
    await Promise.all([
      this.putMetricData('ResponseTime', responseTime, 'Milliseconds', [
        { Name: 'Endpoint', Value: endpoint },
        { Name: 'StatusCode', Value: statusCode.toString() },
        { Name: 'TenantId', Value: tenantId || 'unknown' },
      ]),
      
      // Track request count
      this.putMetricData('RequestCount', 1, 'Count', [
        { Name: 'Endpoint', Value: endpoint },
        { Name: 'StatusCode', Value: statusCode.toString() },
        { Name: 'TenantId', Value: tenantId || 'unknown' },
      ]),
    ]);
  }

  /**
   * Track error rates
   */
  async trackErrorRate(errorType, endpoint, tenantId) {
    await this.putMetricData('ErrorCount', 1, 'Count', [
      { Name: 'ErrorType', Value: errorType },
      { Name: 'Endpoint', Value: endpoint },
      { Name: 'TenantId', Value: tenantId || 'unknown' },
    ]);
  }

  /**
   * Track business metrics
   */
  async trackBusinessMetric(metricName, value, dimensions = []) {
    await this.putMetricData(metricName, value, 'Count', [
      ...dimensions,
      { Name: 'MetricType', Value: 'Business' },
    ]);
  }

  /**
   * Track user activities
   */
  async trackUserActivity(activity, userId, tenantId) {
    await this.putMetricData('UserActivity', 1, 'Count', [
      { Name: 'Activity', Value: activity },
      { Name: 'UserId', Value: userId },
      { Name: 'TenantId', Value: tenantId },
    ]);
  }

  /**
   * Track subscription events
   */
  async trackSubscriptionEvent(event, planType, tenantId) {
    await this.putMetricData('SubscriptionEvent', 1, 'Count', [
      { Name: 'Event', Value: event },
      { Name: 'PlanType', Value: planType },
      { Name: 'TenantId', Value: tenantId },
    ]);
  }

  /**
   * Send custom log events to CloudWatch Logs
   */
  async putLogEvents(logGroupName, logStreamName, logEvents) {
    try {
      // Ensure log group exists
      await this.ensureLogGroupExists(logGroupName);

      const command = new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: logEvents.map(event => ({
          message: typeof event.message === 'object' 
            ? JSON.stringify(event.message) 
            : event.message,
          timestamp: event.timestamp || Date.now(),
        })),
      });

      await this.cloudWatchLogsClient.send(command);
      logger.debug('CloudWatch log events sent', { logGroupName, logStreamName });
    } catch (error) {
      logger.error('Failed to send CloudWatch log events', {
        error: error.message,
        logGroupName,
        logStreamName,
      });
    }
  }

  /**
   * Ensure CloudWatch log group exists
   */
  async ensureLogGroupExists(logGroupName) {
    try {
      await this.cloudWatchLogsClient.send(new CreateLogGroupCommand({
        logGroupName,
        retentionInDays: 30, // Configurable retention
      }));
    } catch (error) {
      // Log group already exists or other error
      if (!error.name?.includes('ResourceAlreadyExistsException')) {
        logger.warn('Could not create log group', {
          error: error.message,
          logGroupName,
        });
      }
    }
  }

  /**
   * Get health status of CloudWatch service
   */
  async getHealthStatus() {
    try {
      // Test CloudWatch connectivity
      await this.cloudWatchClient.send(new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [{
          MetricName: 'HealthCheck',
          Value: 1,
          Unit: 'Count',
          Timestamp: new Date(),
        }],
      }));

      return {
        status: 'healthy',
        service: 'CloudWatch',
        timestamp: new Date().toISOString(),
        bufferedMetrics: this.metricsBuffer.length,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'CloudWatch',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Graceful shutdown - flush remaining metrics
   */
  async shutdown() {
    logger.info('Shutting down CloudWatch service...');
    await this.flushMetrics();
  }
}

// Export singleton instance
export const cloudWatchService = new CloudWatchService();
export default cloudWatchService;
