// src/infrastructure/optimization/auto-scaling-manager.js
import { logger } from "#utils/core/logger.js";
import k8s from "@kubernetes/client-node";
import AWS from "aws-sdk";

/**
 * Advanced Auto-scaling Policy Manager
 * Manages comprehensive auto-scaling policies for Kubernetes and AWS
 */
export class AutoScalingManager {
  constructor() {
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromDefault();
    this.k8sApi = this.k8sConfig.makeApiClient(k8s.AppsV1Api);
    this.k8sAutoscalingApi = this.k8sConfig.makeApiClient(k8s.AutoscalingV2Api);
    this.k8sMetricsApi = this.k8sConfig.makeApiClient(k8s.MetricsV1beta1Api);
    
    this.cloudWatch = new AWS.CloudWatch({ region: process.env.AWS_REGION });
    this.autoScaling = new AWS.AutoScaling({ region: process.env.AWS_REGION });
    
    this.scalingPolicies = new Map();
    this.scalingMetrics = new Map();
    this.initializeScalingPolicies();
  }

  /**
   * Initialize comprehensive scaling policies
   */
  initializeScalingPolicies() {
    // CPU-based scaling policy
    this.addScalingPolicy('CPU_BASED_SCALING', {
      name: 'CPU-based Auto Scaling',
      type: 'HPA',
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'cpu',
            target: {
              type: 'Utilization',
              averageUtilization: 70
            }
          }
        }
      ],
      behavior: {
        scaleUp: {
          stabilizationWindowSeconds: 60,
          policies: [
            {
              type: 'Percent',
              value: 50,
              periodSeconds: 60
            },
            {
              type: 'Pods',
              value: 2,
              periodSeconds: 60
            }
          ],
          selectPolicy: 'Min'
        },
        scaleDown: {
          stabilizationWindowSeconds: 300,
          policies: [
            {
              type: 'Percent',
              value: 10,
              periodSeconds: 60
            }
          ]
        }
      }
    });

    // Memory-based scaling policy
    this.addScalingPolicy('MEMORY_BASED_SCALING', {
      name: 'Memory-based Auto Scaling',
      type: 'HPA',
      metrics: [
        {
          type: 'Resource',
          resource: {
            name: 'memory',
            target: {
              type: 'Utilization',
              averageUtilization: 80
            }
          }
        }
      ],
      behavior: {
        scaleUp: {
          stabilizationWindowSeconds: 120,
          policies: [
            {
              type: 'Percent',
              value: 30,
              periodSeconds: 60
            }
          ]
        },
        scaleDown: {
          stabilizationWindowSeconds: 600,
          policies: [
            {
              type: 'Percent',
              value: 5,
              periodSeconds: 120
            }
          ]
        }
      }
    });

    // Request-based scaling policy
    this.addScalingPolicy('REQUEST_BASED_SCALING', {
      name: 'Request-based Auto Scaling',
      type: 'HPA',
      metrics: [
        {
          type: 'Pods',
          pods: {
            metric: {
              name: 'http_requests_per_second'
            },
            target: {
              type: 'AverageValue',
              averageValue: '100'
            }
          }
        }
      ],
      behavior: {
        scaleUp: {
          stabilizationWindowSeconds: 30,
          policies: [
            {
              type: 'Percent',
              value: 100,
              periodSeconds: 30
            },
            {
              type: 'Pods',
              value: 4,
              periodSeconds: 30
            }
          ],
          selectPolicy: 'Max'
        },
        scaleDown: {
          stabilizationWindowSeconds: 300,
          policies: [
            {
              type: 'Percent',
              value: 20,
              periodSeconds: 60
            }
          ]
        }
      }
    });

    // Multi-tenant aware scaling
    this.addScalingPolicy('TENANT_AWARE_SCALING', {
      name: 'Multi-tenant Aware Scaling',
      type: 'HPA',
      metrics: [
        {
          type: 'External',
          external: {
            metric: {
              name: 'active_tenant_count'
            },
            target: {
              type: 'AverageValue',
              averageValue: '10'
            }
          }
        }
      ],
      behavior: {
        scaleUp: {
          stabilizationWindowSeconds: 180,
          policies: [
            {
              type: 'Percent',
              value: 25,
              periodSeconds: 120
            }
          ]
        },
        scaleDown: {
          stabilizationWindowSeconds: 900,
          policies: [
            {
              type: 'Percent',
              value: 10,
              periodSeconds: 300
            }
          ]
        }
      }
    });
  }

  /**
   * Create and deploy HPA with advanced policies
   */
  async createHorizontalPodAutoscaler(deploymentName, namespace, policyId, options = {}) {
    try {
      const policy = this.scalingPolicies.get(policyId);
      if (!policy) {
        throw new Error(`Scaling policy not found: ${policyId}`);
      }

      const hpaSpec = {
        apiVersion: 'autoscaling/v2',
        kind: 'HorizontalPodAutoscaler',
        metadata: {
          name: `${deploymentName}-hpa`,
          namespace: namespace,
          labels: {
            app: deploymentName,
            'scaling-policy': policyId,
            'managed-by': 'auto-scaling-manager'
          }
        },
        spec: {
          scaleTargetRef: {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: deploymentName
          },
          minReplicas: options.minReplicas || 2,
          maxReplicas: options.maxReplicas || 50,
          metrics: policy.metrics,
          behavior: policy.behavior
        }
      };

      // Create HPA
      const response = await this.k8sAutoscalingApi.createNamespacedHorizontalPodAutoscaler(
        namespace,
        hpaSpec
      );

      logger.info(`HPA created successfully: ${deploymentName}-hpa`, {
        namespace,
        policy: policyId,
        minReplicas: hpaSpec.spec.minReplicas,
        maxReplicas: hpaSpec.spec.maxReplicas
      });

      return response.body;

    } catch (error) {
      logger.error(`Failed to create HPA for ${deploymentName}:`, error);
      throw error;
    }
  }

  /**
   * Create predictive scaling policies
   */
  async createPredictiveScalingPolicy(deploymentName, namespace) {
    const predictivePolicy = {
      apiVersion: 'autoscaling/v2',
      kind: 'HorizontalPodAutoscaler',
      metadata: {
        name: `${deploymentName}-predictive-hpa`,
        namespace: namespace
      },
      spec: {
        scaleTargetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: deploymentName
        },
        minReplicas: 3,
        maxReplicas: 100,
        metrics: [
          {
            type: 'Resource',
            resource: {
              name: 'cpu',
              target: {
                type: 'Utilization',
                averageUtilization: 60
              }
            }
          }
        ],
        behavior: {
          scaleUp: {
            stabilizationWindowSeconds: 30,
            policies: [
              {
                type: 'Percent',
                value: 50,
                periodSeconds: 30
              },
              {
                type: 'Pods',
                value: 5,
                periodSeconds: 30
              }
            ],
            selectPolicy: 'Max'
          },
          scaleDown: {
            stabilizationWindowSeconds: 600,
            policies: [
              {
                type: 'Percent',
                value: 15,
                periodSeconds: 120
              }
            ]
          }
        }
      }
    };

    try {
      const response = await this.k8sAutoscalingApi.createNamespacedHorizontalPodAutoscaler(
        namespace,
        predictivePolicy
      );

      logger.info(`Predictive HPA created: ${deploymentName}-predictive-hpa`);
      return response.body;

    } catch (error) {
      logger.error(`Failed to create predictive HPA:`, error);
      throw error;
    }
  }

  /**
   * Configure AWS Auto Scaling Groups
   */
  async configureAWSAutoScaling(autoScalingGroupName, options = {}) {
    try {
      const scalingPolicies = [];

      // Scale Up Policy
      const scaleUpPolicy = {
        AdjustmentType: 'ChangeInCapacity',
        AutoScalingGroupName: autoScalingGroupName,
        PolicyName: `${autoScalingGroupName}-scale-up`,
        PolicyType: 'StepScaling',
        StepAdjustments: [
          {
            MetricIntervalLowerBound: 0,
            MetricIntervalUpperBound: 50,
            ScalingAdjustment: 1
          },
          {
            MetricIntervalLowerBound: 50,
            ScalingAdjustment: 2
          }
        ],
        MetricAggregationType: 'Average',
        Cooldown: 300
      };

      const scaleUpResponse = await this.autoScaling.putScalingPolicy(scaleUpPolicy).promise();
      scalingPolicies.push(scaleUpResponse);

      // Scale Down Policy
      const scaleDownPolicy = {
        AdjustmentType: 'ChangeInCapacity',
        AutoScalingGroupName: autoScalingGroupName,
        PolicyName: `${autoScalingGroupName}-scale-down`,
        PolicyType: 'StepScaling',
        StepAdjustments: [
          {
            MetricIntervalUpperBound: 0,
            ScalingAdjustment: -1
          }
        ],
        MetricAggregationType: 'Average',
        Cooldown: 600
      };

      const scaleDownResponse = await this.autoScaling.putScalingPolicy(scaleDownPolicy).promise();
      scalingPolicies.push(scaleDownResponse);

      // Create CloudWatch Alarms
      await this.createCloudWatchAlarms(autoScalingGroupName, scaleUpResponse.PolicyARN, scaleDownResponse.PolicyARN);

      logger.info(`AWS Auto Scaling configured for: ${autoScalingGroupName}`);
      return scalingPolicies;

    } catch (error) {
      logger.error(`Failed to configure AWS Auto Scaling:`, error);
      throw error;
    }
  }

  /**
   * Monitor scaling activities
   */
  async monitorScalingActivities() {
    setInterval(async () => {
      try {
        // Monitor Kubernetes HPA
        await this.monitorKubernetesHPA();
        
        // Monitor AWS Auto Scaling
        await this.monitorAWSAutoScaling();
        
        // Generate scaling reports
        await this.generateScalingReport();

      } catch (error) {
        logger.error('Scaling monitoring failed:', error);
      }
    }, 60000); // Every minute

    logger.info('Auto-scaling monitoring started');
  }

  // Helper methods
  addScalingPolicy(policyId, policy) {
    this.scalingPolicies.set(policyId, policy);
    logger.debug(`Scaling policy added: ${policyId}`);
  }

  async createCloudWatchAlarms(asgName, scaleUpPolicyArn, scaleDownPolicyArn) {
    // Scale Up Alarm
    await this.cloudWatch.putMetricAlarm({
      AlarmName: `${asgName}-cpu-high`,
      AlarmDescription: 'Scale up when CPU exceeds 70%',
      MetricName: 'CPUUtilization',
      Namespace: 'AWS/EC2',
      Statistic: 'Average',
      Period: 300,
      EvaluationPeriods: 2,
      Threshold: 70,
      ComparisonOperator: 'GreaterThanThreshold',
      AlarmActions: [scaleUpPolicyArn],
      Dimensions: [
        {
          Name: 'AutoScalingGroupName',
          Value: asgName
        }
      ]
    }).promise();

    // Scale Down Alarm
    await this.cloudWatch.putMetricAlarm({
      AlarmName: `${asgName}-cpu-low`,
      AlarmDescription: 'Scale down when CPU is below 30%',
      MetricName: 'CPUUtilization',
      Namespace: 'AWS/EC2',
      Statistic: 'Average',
      Period: 300,
      EvaluationPeriods: 3,
      Threshold: 30,
      ComparisonOperator: 'LessThanThreshold',
      AlarmActions: [scaleDownPolicyArn],
      Dimensions: [
        {
          Name: 'AutoScalingGroupName',
          Value: asgName
        }
      ]
    }).promise();
  }

  async monitorKubernetesHPA() {
    // Implementation for monitoring K8s HPA
    const hpas = await this.k8sAutoscalingApi.listHorizontalPodAutoscalerForAllNamespaces();
    
    for (const hpa of hpas.body.items) {
      const metrics = {
        name: hpa.metadata.name,
        namespace: hpa.metadata.namespace,
        currentReplicas: hpa.status.currentReplicas,
        desiredReplicas: hpa.status.desiredReplicas,
        minReplicas: hpa.spec.minReplicas,
        maxReplicas: hpa.spec.maxReplicas
      };
      
      this.scalingMetrics.set(`k8s:${hpa.metadata.namespace}:${hpa.metadata.name}`, metrics);
    }
  }

  async monitorAWSAutoScaling() {
    // Implementation for monitoring AWS Auto Scaling
    try {
      const activities = await this.autoScaling.describeScalingActivities().promise();
      
      for (const activity of activities.Activities.slice(0, 10)) {
        logger.debug('AWS Scaling Activity:', {
          activityId: activity.ActivityId,
          cause: activity.Cause,
          statusCode: activity.StatusCode,
          startTime: activity.StartTime
        });
      }
    } catch (error) {
      logger.warn('Failed to monitor AWS Auto Scaling:', error.message);
    }
  }

  async generateScalingReport() {
    const report = {
      timestamp: new Date(),
      kubernetes: {
        totalHPAs: this.scalingMetrics.size,
        activeScaling: 0,
        averageUtilization: 0
      },
      aws: {
        totalASGs: 0,
        recentActivities: 0
      }
    };

    // Calculate K8s metrics
    let totalUtilization = 0;
    let activeScalingCount = 0;

    for (const [key, metrics] of this.scalingMetrics) {
      if (key.startsWith('k8s:')) {
        if (metrics.currentReplicas !== metrics.desiredReplicas) {
          activeScalingCount++;
        }
      }
    }

    report.kubernetes.activeScaling = activeScalingCount;
    
    logger.debug('Scaling report generated:', report);
    return report;
  }
}

// Export singleton instance
export const autoScalingManager = new AutoScalingManager();
