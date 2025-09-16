// src/infrastructure/monitoring/elasticache-monitor.js
import { CloudWatch } from '@aws-sdk/client-cloudwatch';
import { logger } from '#utils/core/logger.js';

class ElastiCacheMonitor {
  constructor() {
    this.cloudWatch = new CloudWatch({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.replicationGroupId = process.env.ELASTICACHE_REPLICATION_GROUP_ID;
  }

  async getMetrics() {
    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 5 * 60 * 1000); // Last 5 minutes

      const params = {
        Namespace: 'AWS/ElastiCache',
        StartTime: startTime,
        EndTime: endTime,
        Period: 300,
        Statistics: ['Average', 'Maximum'],
        Dimensions: [
          {
            Name: 'ReplicationGroupId',
            Value: this.replicationGroupId
          }
        ]
      };

      // Get key metrics
      const metrics = await Promise.all([
        this.getMetricData({ ...params, MetricName: 'CPUUtilization' }),
        this.getMetricData({ ...params, MetricName: 'DatabaseMemoryUsagePercentage' }),
        this.getMetricData({ ...params, MetricName: 'CurrConnections' }),
        this.getMetricData({ ...params, MetricName: 'CacheHitRate' }),
        this.getMetricData({ ...params, MetricName: 'ReplicationLag' })
      ]);

      return {
        cpuUtilization: metrics[0],
        memoryUsage: metrics[1],
        connections: metrics[2],
        cacheHitRate: metrics[3],
        replicationLag: metrics[4],
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`ElastiCache metrics error: ${error.message}`);
      throw error;
    }
  }

  async getMetricData(params) {
    try {
      const response = await this.cloudWatch.getMetricStatistics(params);
      return response.Datapoints || [];
    } catch (error) {
      logger.error(`Failed to get metric ${params.MetricName}: ${error.message}`);
      return [];
    }
  }
}

export default new ElastiCacheMonitor();
