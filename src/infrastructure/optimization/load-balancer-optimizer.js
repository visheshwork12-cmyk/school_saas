// src/infrastructure/optimization/load-balancer-optimizer.js
import { logger } from "#utils/core/logger.js";
import AWS from "aws-sdk";
import k8s from "@kubernetes/client-node";

/**
 * Load Balancer Optimization Manager
 * Optimizes load balancer performance and configuration
 */
export class LoadBalancerOptimizer {
  constructor() {
    this.elbv2 = new AWS.ELBv2({ region: process.env.AWS_REGION });
    this.cloudWatch = new AWS.CloudWatch({ region: process.env.AWS_REGION });
    
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromDefault();
    this.k8sApi = this.k8sConfig.makeApiClient(k8s.CoreV1Api);
    
    this.optimizationStrategies = new Map();
    this.loadBalancerMetrics = new Map();
    this.initializeOptimizationStrategies();
  }

  /**
   * Initialize load balancer optimization strategies
   */
  initializeOptimizationStrategies() {
    // Health check optimization
    this.addStrategy('HEALTH_CHECK_OPTIMIZATION', {
      name: 'Health Check Optimization',
      execute: this.optimizeHealthChecks.bind(this),
      priority: 1
    });

    // Connection draining optimization
    this.addStrategy('CONNECTION_DRAINING', {
      name: 'Connection Draining Optimization',
      execute: this.optimizeConnectionDraining.bind(this),
      priority: 2
    });

    // SSL offloading optimization
    this.addStrategy('SSL_OFFLOADING', {
      name: 'SSL Offloading Optimization',
      execute: this.optimizeSSLOffloading.bind(this),
      priority: 3
    });

    // Cross-zone load balancing
    this.addStrategy('CROSS_ZONE_BALANCING', {
      name: 'Cross-zone Load Balancing',
      execute: this.enableCrossZoneBalancing.bind(this),
      priority: 4
    });
  }

  /**
   * Configure AWS Application Load Balancer with optimization
   */
  async configureOptimizedALB(albConfig) {
    try {
      logger.info('Configuring optimized Application Load Balancer');

      // Create load balancer with optimization settings
      const createParams = {
        Name: albConfig.name,
        Subnets: albConfig.subnets,
        SecurityGroups: albConfig.securityGroups,
        Scheme: albConfig.scheme || 'internet-facing',
        Type: 'application',
        IpAddressType: 'ipv4',
        Tags: [
          {
            Key: 'Environment',
            Value: process.env.NODE_ENV || 'production'
          },
          {
            Key: 'Application',
            Value: 'school-erp-saas'
          },
          {
            Key: 'ManagedBy',
            Value: 'load-balancer-optimizer'
          }
        ]
      };

      const loadBalancerResult = await this.elbv2.createLoadBalancer(createParams).promise();
      const loadBalancerArn = loadBalancerResult.LoadBalancers[0].LoadBalancerArn;

      // Configure target groups with health check optimization
      const targetGroupArn = await this.createOptimizedTargetGroup(albConfig, loadBalancerArn);

      // Configure listeners with SSL optimization
      await this.createOptimizedListeners(loadBalancerArn, targetGroupArn, albConfig);

      // Configure load balancer attributes
      await this.configureLoadBalancerAttributes(loadBalancerArn);

      // Set up monitoring and alarms
      await this.setupLoadBalancerMonitoring(loadBalancerArn, albConfig.name);

      logger.info(`Optimized ALB configured successfully: ${albConfig.name}`);
      return { loadBalancerArn, targetGroupArn };

    } catch (error) {
      logger.error('Failed to configure optimized ALB:', error);
      throw error;
    }
  }

  /**
   * Create optimized target group
   */
  async createOptimizedTargetGroup(config, loadBalancerArn) {
    const targetGroupParams = {
      Name: `${config.name}-tg`,
      Protocol: 'HTTP',
      Port: config.targetPort || 3000,
      VpcId: config.vpcId,
      TargetType: 'ip',
      HealthCheckProtocol: 'HTTP',
      HealthCheckPath: '/health',
      HealthCheckIntervalSeconds: 15,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 3,
      Matcher: {
        HttpCode: '200,201'
      },
      Tags: [
        {
          Key: 'LoadBalancer',
          Value: config.name
        }
      ]
    };

    const targetGroupResult = await this.elbv2.createTargetGroup(targetGroupParams).promise();
    const targetGroupArn = targetGroupResult.TargetGroups[0].TargetGroupArn;

    // Configure target group attributes for optimization
    await this.elbv2.modifyTargetGroupAttributes({
      TargetGroupArn: targetGroupArn,
      Attributes: [
        {
          Key: 'deregistration_delay.timeout_seconds',
          Value: '30'
        },
        {
          Key: 'stickiness.enabled',
          Value: 'true'
        },
        {
          Key: 'stickiness.type',
          Value: 'lb_cookie'
        },
        {
          Key: 'stickiness.lb_cookie.duration_seconds',
          Value: '86400'
        },
        {
          Key: 'slow_start.duration_seconds',
          Value: '30'
        }
      ]
    }).promise();

    return targetGroupArn;
  }

  /**
   * Create optimized listeners
   */
  async createOptimizedListeners(loadBalancerArn, targetGroupArn, config) {
    // HTTP Listener (redirect to HTTPS)
    await this.elbv2.createListener({
      LoadBalancerArn: loadBalancerArn,
      Protocol: 'HTTP',
      Port: 80,
      DefaultActions: [
        {
          Type: 'redirect',
          RedirectConfig: {
            Protocol: 'HTTPS',
            Port: '443',
            StatusCode: 'HTTP_301'
          }
        }
      ]
    }).promise();

    // HTTPS Listener with SSL optimization
    const httpsListener = await this.elbv2.createListener({
      LoadBalancerArn: loadBalancerArn,
      Protocol: 'HTTPS',
      Port: 443,
      SslPolicy: 'ELBSecurityPolicy-TLS-1-2-2017-01',
      Certificates: [
        {
          CertificateArn: config.certificateArn
        }
      ],
      DefaultActions: [
        {
          Type: 'forward',
          TargetGroupArn: targetGroupArn
        }
      ]
    }).promise();

    // Create advanced routing rules
    await this.createAdvancedRoutingRules(httpsListener.Listeners[0].ListenerArn, targetGroupArn);
  }

  /**
   * Create advanced routing rules
   */
  async createAdvancedRoutingRules(listenerArn, targetGroupArn) {
    // API rate limiting rule
    await this.elbv2.createRule({
      ListenerArn: listenerArn,
      Priority: 100,
      Conditions: [
        {
          Field: 'path-pattern',
          Values: ['/api/*']
        }
      ],
      Actions: [
        {
          Type: 'forward',
          TargetGroupArn: targetGroupArn
        }
      ]
    }).promise();

    // Static content caching rule
    await this.elbv2.createRule({
      ListenerArn: listenerArn,
      Priority: 200,
      Conditions: [
        {
          Field: 'path-pattern',
          Values: ['/static/*', '/assets/*', '*.css', '*.js', '*.png', '*.jpg']
        }
      ],
      Actions: [
        {
          Type: 'forward',
          TargetGroupArn: targetGroupArn
        }
      ]
    }).promise();
  }

  /**
   * Configure load balancer attributes for optimization
   */
  async configureLoadBalancerAttributes(loadBalancerArn) {
    await this.elbv2.modifyLoadBalancerAttributes({
      LoadBalancerArn: loadBalancerArn,
      Attributes: [
        {
          Key: 'idle_timeout.timeout_seconds',
          Value: '60'
        },
        {
          Key: 'routing.http2.enabled',
          Value: 'true'
        },
        {
          Key: 'access_logs.s3.enabled',
          Value: 'true'
        },
        {
          Key: 'access_logs.s3.bucket',
          Value: process.env.ALB_LOGS_BUCKET
        },
        {
          Key: 'access_logs.s3.prefix',
          Value: 'school-erp-alb'
        },
        {
          Key: 'deletion_protection.enabled',
          Value: 'true'
        }
      ]
    }).promise();
  }

  /**
   * Set up comprehensive load balancer monitoring
   */
  async setupLoadBalancerMonitoring(loadBalancerArn, loadBalancerName) {
    const alarmConfigs = [
      {
        AlarmName: `${loadBalancerName}-high-response-time`,
        MetricName: 'TargetResponseTime',
        Threshold: 2.0,
        ComparisonOperator: 'GreaterThanThreshold'
      },
      {
        AlarmName: `${loadBalancerName}-high-error-rate`,
        MetricName: 'HTTPCode_Target_5XX_Count',
        Threshold: 10,
        ComparisonOperator: 'GreaterThanThreshold'
      },
      {
        AlarmName: `${loadBalancerName}-unhealthy-hosts`,
        MetricName: 'UnHealthyHostCount',
        Threshold: 1,
        ComparisonOperator: 'GreaterThanOrEqualToThreshold'
      }
    ];

    for (const alarmConfig of alarmConfigs) {
      await this.cloudWatch.putMetricAlarm({
        AlarmName: alarmConfig.AlarmName,
        AlarmDescription: `Monitor ${alarmConfig.MetricName} for ${loadBalancerName}`,
        MetricName: alarmConfig.MetricName,
        Namespace: 'AWS/ApplicationELB',
        Statistic: 'Average',
        Period: 300,
        EvaluationPeriods: 2,
        Threshold: alarmConfig.Threshold,
        ComparisonOperator: alarmConfig.ComparisonOperator,
        Dimensions: [
          {
            Name: 'LoadBalancer',
            Value: loadBalancerArn.split('/').slice(-3).join('/')
          }
        ],
        AlarmActions: [
          process.env.SNS_ALARM_TOPIC_ARN
        ]
      }).promise();
    }

    logger.info(`Monitoring configured for load balancer: ${loadBalancerName}`);
  }

  /**
   * Optimize health checks
   */
  async optimizeHealthChecks(targetGroupArn) {
    await this.elbv2.modifyTargetGroup({
      TargetGroupArn: targetGroupArn,
      HealthCheckIntervalSeconds: 10,
      HealthCheckTimeoutSeconds: 5,
      HealthyThresholdCount: 2,
      UnhealthyThresholdCount: 2,
      HealthCheckPath: '/health'
    }).promise();

    logger.info('Health checks optimized');
  }

  /**
   * Monitor load balancer performance
   */
  async monitorLoadBalancerPerformance() {
    setInterval(async () => {
      try {
        await this.collectLoadBalancerMetrics();
        await this.analyzePerformance();
        await this.generateOptimizationRecommendations();
      } catch (error) {
        logger.error('Load balancer monitoring failed:', error);
      }
    }, 300000); // Every 5 minutes

    logger.info('Load balancer performance monitoring started');
  }

  // Helper methods
  addStrategy(strategyId, strategy) {
    this.optimizationStrategies.set(strategyId, strategy);
  }

  async collectLoadBalancerMetrics() {
    // Implementation for collecting LB metrics from CloudWatch
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 300000); // Last 5 minutes

    const metricsToCollect = [
      'RequestCount',
      'TargetResponseTime',
      'HTTPCode_Target_2XX_Count',
      'HTTPCode_Target_4XX_Count',
      'HTTPCode_Target_5XX_Count'
    ];

    for (const metricName of metricsToCollect) {
      try {
        const params = {
          Namespace: 'AWS/ApplicationELB',
          MetricName: metricName,
          StartTime: startTime,
          EndTime: endTime,
          Period: 300,
          Statistics: ['Average', 'Sum']
        };

        const result = await this.cloudWatch.getMetricStatistics(params).promise();
        this.loadBalancerMetrics.set(metricName, result.Datapoints);
      } catch (error) {
        logger.warn(`Failed to collect metric ${metricName}:`, error.message);
      }
    }
  }

  async analyzePerformance() {
    // Analyze collected metrics and identify optimization opportunities
    const responseTimeData = this.loadBalancerMetrics.get('TargetResponseTime') || [];
    const errorRateData = this.loadBalancerMetrics.get('HTTPCode_Target_5XX_Count') || [];

    const avgResponseTime = responseTimeData.length > 0 
      ? responseTimeData.reduce((sum, point) => sum + point.Average, 0) / responseTimeData.length 
      : 0;

    const totalErrors = errorRateData.reduce((sum, point) => sum + point.Sum, 0);

    if (avgResponseTime > 2.0) {
      logger.warn(`High average response time detected: ${avgResponseTime.toFixed(2)}s`);
    }

    if (totalErrors > 10) {
      logger.warn(`High error count detected: ${totalErrors} errors in last 5 minutes`);
    }
  }
}

// Export singleton instance
export const loadBalancerOptimizer = new LoadBalancerOptimizer();
