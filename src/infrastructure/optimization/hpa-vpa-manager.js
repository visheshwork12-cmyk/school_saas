// src/infrastructure/optimization/hpa-vpa-manager.js
import k8s from "@kubernetes/client-node";
import { logger } from "#utils/core/logger.js";
import YAML from "yaml";

/**
 * HPA/VPA Management Service
 * Manages Horizontal and Vertical Pod Autoscalers
 */
export class HPAVPAManager {
  constructor() {
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromDefault();
    this.k8sApi = this.k8sConfig.makeApiClient(k8s.CoreV1Api);
    this.autoscalingV2Api = this.k8sConfig.makeApiClient(k8s.AutoscalingV2Api);
    this.customObjectsApi = this.k8sConfig.makeApiClient(k8s.CustomObjectsApi);
    
    this.hpaConfigs = new Map();
    this.vpaConfigs = new Map();
    this.autoscalingMetrics = new Map();
    this.initializeAutoscalingConfigs();
  }

  /**
   * Initialize autoscaling configurations
   */
  initializeAutoscalingConfigs() {
    // Comprehensive HPA configuration for different workload types
    this.addHPAConfig('API_SERVER', {
      name: 'API Server HPA',
      targetDeployment: 'school-erp-api',
      minReplicas: 2,
      maxReplicas: 50,
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
        },
        {
          type: 'Resource',
          resource: {
            name: 'memory',
            target: {
              type: 'Utilization',
              averageUtilization: 80
            }
          }
        },
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

    // Background job processor HPA
    this.addHPAConfig('BACKGROUND_PROCESSOR', {
      name: 'Background Processor HPA',
      targetDeployment: 'school-erp-bg-processor',
      minReplicas: 1,
      maxReplicas: 20,
      metrics: [
        {
          type: 'External',
          external: {
            metric: {
              name: 'redis_queue_length',
              selector: {
                matchLabels: {
                  queue: 'background_jobs'
                }
              }
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
          stabilizationWindowSeconds: 30,
          policies: [
            {
              type: 'Percent',
              value: 100,
              periodSeconds: 30
            }
          ]
        },
        scaleDown: {
          stabilizationWindowSeconds: 600,
          policies: [
            {
              type: 'Percent',
              value: 20,
              periodSeconds: 120
            }
          ]
        }
      }
    });

    // VPA configurations
    this.addVPAConfig('API_SERVER_VPA', {
      name: 'API Server VPA',
      targetDeployment: 'school-erp-api',
      updateMode: 'Auto',
      resourcePolicy: {
        containerPolicies: [
          {
            containerName: 'api-server',
            maxAllowed: {
              cpu: '2000m',
              memory: '4Gi'
            },
            minAllowed: {
              cpu: '100m',
              memory: '128Mi'
            },
            controlledResources: ['cpu', 'memory'],
            controlledValues: 'RequestsAndLimits'
          }
        ]
      }
    });
  }

  /**
   * Deploy HPA configuration
   */
  async deployHPA(configId, namespace = 'default', options = {}) {
    try {
      const config = this.hpaConfigs.get(configId);
      if (!config) {
        throw new Error(`HPA configuration not found: ${configId}`);
      }

      const hpaSpec = {
        apiVersion: 'autoscaling/v2',
        kind: 'HorizontalPodAutoscaler',
        metadata: {
          name: `${config.targetDeployment}-hpa`,
          namespace: namespace,
          labels: {
            app: config.targetDeployment,
            'autoscaling-config': configId,
            'managed-by': 'hpa-vpa-manager'
          },
          annotations: {
            'autoscaling.alpha.kubernetes.io/metrics': JSON.stringify(config.metrics),
            'deployment.kubernetes.io/revision': '1'
          }
        },
        spec: {
          scaleTargetRef: {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: config.targetDeployment
          },
          minReplicas: options.minReplicas || config.minReplicas,
          maxReplicas: options.maxReplicas || config.maxReplicas,
          metrics: config.metrics,
          behavior: config.behavior
        }
      };

      const response = await this.autoscalingV2Api.createNamespacedHorizontalPodAutoscaler(
        namespace,
        hpaSpec
      );

      logger.info(`HPA deployed successfully: ${config.targetDeployment}-hpa`, {
        namespace,
        minReplicas: hpaSpec.spec.minReplicas,
        maxReplicas: hpaSpec.spec.maxReplicas,
        metricsCount: config.metrics.length
      });

      return response.body;

    } catch (error) {
      logger.error(`Failed to deploy HPA ${configId}:`, error);
      throw error;
    }
  }

  /**
   * Deploy VPA configuration
   */
  async deployVPA(configId, namespace = 'default', options = {}) {
    try {
      const config = this.vpaConfigs.get(configId);
      if (!config) {
        throw new Error(`VPA configuration not found: ${configId}`);
      }

      const vpaSpec = {
        apiVersion: 'autoscaling.k8s.io/v1',
        kind: 'VerticalPodAutoscaler',
        metadata: {
          name: `${config.targetDeployment}-vpa`,
          namespace: namespace,
          labels: {
            app: config.targetDeployment,
            'autoscaling-config': configId,
            'managed-by': 'hpa-vpa-manager'
          }
        },
        spec: {
          targetRef: {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            name: config.targetDeployment
          },
          updatePolicy: {
            updateMode: options.updateMode || config.updateMode
          },
          resourcePolicy: config.resourcePolicy
        }
      };

      const response = await this.customObjectsApi.createNamespacedCustomObject(
        'autoscaling.k8s.io',
        'v1',
        namespace,
        'verticalpodautoscalers',
        vpaSpec
      );

      logger.info(`VPA deployed successfully: ${config.targetDeployment}-vpa`, {
        namespace,
        updateMode: vpaSpec.spec.updatePolicy.updateMode
      });

      return response.body;

    } catch (error) {
      logger.error(`Failed to deploy VPA ${configId}:`, error);
      throw error;
    }
  }

  /**
   * Deploy KEDA ScaledObject for event-driven autoscaling
   */
  async deployKEDAScaledObject(config, namespace = 'default') {
    try {
      const scaledObjectSpec = {
        apiVersion: 'keda.sh/v1alpha1',
        kind: 'ScaledObject',
        metadata: {
          name: `${config.targetDeployment}-scaledobject`,
          namespace: namespace,
          labels: {
            app: config.targetDeployment,
            'managed-by': 'hpa-vpa-manager'
          }
        },
        spec: {
          scaleTargetRef: {
            name: config.targetDeployment
          },
          pollingInterval: config.pollingInterval || 15,
          cooldownPeriod: config.cooldownPeriod || 300,
          idleReplicaCount: config.idleReplicaCount || 0,
          minReplicaCount: config.minReplicaCount || 1,
          maxReplicaCount: config.maxReplicaCount || 100,
          triggers: config.triggers
        }
      };

      const response = await this.customObjectsApi.createNamespacedCustomObject(
        'keda.sh',
        'v1alpha1',
        namespace,
        'scaledobjects',
        scaledObjectSpec
      );

      logger.info(`KEDA ScaledObject deployed: ${config.targetDeployment}-scaledobject`);
      return response.body;

    } catch (error) {
      logger.error(`Failed to deploy KEDA ScaledObject:`, error);
      throw error;
    }
  }

  /**
   * Monitor autoscaling activities
   */
  async monitorAutoscalingActivities() {
    setInterval(async () => {
      try {
        await this.collectHPAMetrics();
        await this.collectVPAMetrics();
        await this.analyzeAutoscalingPerformance();
        await this.generateAutoscalingRecommendations();
      } catch (error) {
        logger.error('Autoscaling monitoring failed:', error);
      }
    }, 60000); // Every minute

    logger.info('Autoscaling monitoring started');
  }

  /**
   * Collect HPA metrics
   */
  async collectHPAMetrics() {
    try {
      const hpas = await this.autoscalingV2Api.listHorizontalPodAutoscalerForAllNamespaces();
      
      for (const hpa of hpas.body.items) {
        const metrics = {
          name: hpa.metadata.name,
          namespace: hpa.metadata.namespace,
          currentReplicas: hpa.status.currentReplicas,
          desiredReplicas: hpa.status.desiredReplicas,
          minReplicas: hpa.spec.minReplicas,
          maxReplicas: hpa.spec.maxReplicas,
          targetCPUUtilization: this.extractTargetCPUUtilization(hpa.spec.metrics),
          currentCPUUtilization: hpa.status.currentMetrics?.[0]?.resource?.current?.averageUtilization,
          lastScaleTime: hpa.status.lastScaleTime,
          conditions: hpa.status.conditions || []
        };

        this.autoscalingMetrics.set(`hpa:${hpa.metadata.namespace}:${hpa.metadata.name}`, metrics);
      }

    } catch (error) {
      logger.error('Failed to collect HPA metrics:', error);
    }
  }

  /**
   * Collect VPA metrics
   */
  async collectVPAMetrics() {
    try {
      const vpas = await this.customObjectsApi.listClusterCustomObject(
        'autoscaling.k8s.io',
        'v1',
        'verticalpodautoscalers'
      );

      for (const vpa of vpas.body.items) {
        const metrics = {
          name: vpa.metadata.name,
          namespace: vpa.metadata.namespace,
          updateMode: vpa.spec.updatePolicy?.updateMode,
          targetRef: vpa.spec.targetRef,
          recommendations: vpa.status?.recommendation?.containerRecommendations || [],
          conditions: vpa.status?.conditions || [],
          lastUpdateTime: vpa.status?.lastUpdateTime
        };

        this.autoscalingMetrics.set(`vpa:${vpa.metadata.namespace}:${vpa.metadata.name}`, metrics);
      }

    } catch (error) {
      logger.error('Failed to collect VPA metrics:', error);
    }
  }

  /**
   * Analyze autoscaling performance
   */
  async analyzeAutoscalingPerformance() {
    const analysis = {
      hpa: {
        active: 0,
        scaling: 0,
        issues: []
      },
      vpa: {
        active: 0,
        recommendations: 0,
        issues: []
      }
    };

    for (const [key, metrics] of this.autoscalingMetrics) {
      if (key.startsWith('hpa:')) {
        analysis.hpa.active++;
        
        if (metrics.currentReplicas !== metrics.desiredReplicas) {
          analysis.hpa.scaling++;
        }

        // Check for issues
        if (metrics.currentReplicas === metrics.maxReplicas) {
          analysis.hpa.issues.push({
            hpa: metrics.name,
            issue: 'At maximum replica count',
            recommendation: 'Consider increasing maxReplicas'
          });
        }

        if (metrics.conditions.some(c => c.type === 'ScalingLimited' && c.status === 'True')) {
          analysis.hpa.issues.push({
            hpa: metrics.name,
            issue: 'Scaling is limited',
            recommendation: 'Check resource constraints'
          });
        }

      } else if (key.startsWith('vpa:')) {
        analysis.vpa.active++;
        analysis.vpa.recommendations += metrics.recommendations.length;

        // Check for VPA issues
        const failedConditions = metrics.conditions.filter(c => c.status === 'False');
        if (failedConditions.length > 0) {
          analysis.vpa.issues.push({
            vpa: metrics.name,
            issue: 'VPA has failed conditions',
            conditions: failedConditions.map(c => c.type)
          });
        }
      }
    }

    this.autoscalingAnalysis = analysis;
    return analysis;
  }

  /**
   * Generate autoscaling recommendations
   */
  async generateAutoscalingRecommendations() {
    const recommendations = [];

    if (!this.autoscalingAnalysis) return recommendations;

    // HPA recommendations
    for (const issue of this.autoscalingAnalysis.hpa.issues) {
      recommendations.push({
        type: 'HPA_OPTIMIZATION',
        priority: 'MEDIUM',
        target: issue.hpa,
        issue: issue.issue,
        recommendation: issue.recommendation
      });
    }

    // VPA recommendations
    for (const issue of this.autoscalingAnalysis.vpa.issues) {
      recommendations.push({
        type: 'VPA_OPTIMIZATION',
        priority: 'MEDIUM',
        target: issue.vpa,
        issue: issue.issue,
        conditions: issue.conditions
      });
    }

    // General recommendations based on metrics
    for (const [key, metrics] of this.autoscalingMetrics) {
      if (key.startsWith('hpa:')) {
        // Check if HPA is frequently hitting limits
        if (metrics.currentReplicas === metrics.maxReplicas) {
          recommendations.push({
            type: 'INCREASE_MAX_REPLICAS',
            priority: 'HIGH',
            target: metrics.name,
            current: metrics.maxReplicas,
            suggested: Math.min(metrics.maxReplicas * 1.5, 100)
          });
        }

        // Check for inefficient scaling
        if (metrics.currentCPUUtilization && metrics.targetCPUUtilization) {
          const utilizationDiff = Math.abs(metrics.currentCPUUtilization - metrics.targetCPUUtilization);
          if (utilizationDiff > 20) {
            recommendations.push({
              type: 'ADJUST_TARGET_UTILIZATION',
              priority: 'MEDIUM',
              target: metrics.name,
              current: metrics.targetCPUUtilization,
              actual: metrics.currentCPUUtilization,
              suggested: Math.round((metrics.targetCPUUtilization + metrics.currentCPUUtilization) / 2)
            });
          }
        }
      }
    }

    if (recommendations.length > 0) {
      logger.info(`Generated ${recommendations.length} autoscaling recommendations`);
    }

    return recommendations;
  }

  // Helper methods
  addHPAConfig(configId, config) {
    this.hpaConfigs.set(configId, config);
  }

  addVPAConfig(configId, config) {
    this.vpaConfigs.set(configId, config);
  }

  extractTargetCPUUtilization(metrics) {
    const cpuMetric = metrics.find(m => m.type === 'Resource' && m.resource.name === 'cpu');
    return cpuMetric?.resource?.target?.averageUtilization;
  }

  /**
   * Get autoscaling dashboard data
   */
  async getAutoscalingDashboard() {
    const dashboard = {
      timestamp: new Date(),
      summary: {
        totalHPAs: 0,
        totalVPAs: 0,
        activeScaling: 0,
        recommendations: 0
      },
      hpas: [],
      vpas: [],
      recommendations: await this.generateAutoscalingRecommendations()
    };

    for (const [key, metrics] of this.autoscalingMetrics) {
      if (key.startsWith('hpa:')) {
        dashboard.summary.totalHPAs++;
        dashboard.hpas.push(metrics);
        
        if (metrics.currentReplicas !== metrics.desiredReplicas) {
          dashboard.summary.activeScaling++;
        }
      } else if (key.startsWith('vpa:')) {
        dashboard.summary.totalVPAs++;
        dashboard.vpas.push(metrics);
      }
    }

    dashboard.summary.recommendations = dashboard.recommendations.length;
    return dashboard;
  }
}

// Export singleton instance
export const hpaVpaManager = new HPAVPAManager();
