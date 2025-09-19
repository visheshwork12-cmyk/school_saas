// src/infrastructure/deployment/canary-deployment-manager.js
import k8s from "@kubernetes/client-node";
import { logger } from "#utils/core/logger.js";
import axios from "axios";

/**
 * Canary Deployment Manager
 * Manages progressive canary deployments with automated promotion/rollback
 */
export class CanaryDeploymentManager {
  constructor() {
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromDefault();
    this.k8sApi = this.k8sConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.k8sConfig.makeApiClient(k8s.AppsV1Api);
    this.customObjectsApi = this.k8sConfig.makeApiClient(k8s.CustomObjectsApi);
    
    this.canaryDeployments = new Map();
    this.metricsEndpoint = process.env.PROMETHEUS_ENDPOINT || 'http://prometheus:9090';
  }

  /**
   * Start canary deployment
   */
  async startCanaryDeployment(deploymentName, newImage, config = {}) {
    try {
      logger.info(`Starting canary deployment: ${deploymentName}`);

      const canaryConfig = {
        name: `${deploymentName}-canary`,
        targetRef: {
          apiVersion: 'apps/v1',
          kind: 'Deployment',
          name: deploymentName
        },
        service: {
          port: config.port || 80,
          targetPort: config.targetPort || 3000,
          gateways: config.gateways || [`${deploymentName}-gateway`],
          hosts: config.hosts || [`${deploymentName}.school-erp.com`]
        },
        analysis: {
          interval: config.interval || '30s',
          threshold: config.threshold || 5,
          maxWeight: config.maxWeight || 50,
          stepWeight: config.stepWeight || 10,
          iterations: config.iterations || 10,
          metrics: this.getDefaultMetrics(),
          webhooks: this.getDefaultWebhooks(deploymentName)
        }
      };

      // Update deployment with new image
      await this.updateDeploymentImage(deploymentName, newImage, config.namespace || 'default');

      // Create or update Flagger canary resource
      const canaryResource = await this.createCanaryResource(canaryConfig, config.namespace || 'default');

      // Start monitoring canary progress
      const monitoringPromise = this.monitorCanaryProgress(
        canaryConfig.name, 
        config.namespace || 'default',
        config.timeout || 1800 // 30 minutes default
      );

      this.canaryDeployments.set(canaryConfig.name, {
        config: canaryConfig,
        startTime: new Date(),
        status: 'progressing',
        monitoring: monitoringPromise
      });

      logger.info(`Canary deployment started successfully: ${deploymentName}`);

      return {
        success: true,
        canaryName: canaryConfig.name,
        canaryResource,
        monitoring: monitoringPromise
      };

    } catch (error) {
      logger.error(`Failed to start canary deployment for ${deploymentName}:`, error);
      throw error;
    }
  }

  /**
   * Create Flagger canary resource
   */
  async createCanaryResource(config, namespace) {
    try {
      const canarySpec = {
        apiVersion: 'flagger.app/v1beta1',
        kind: 'Canary',
        metadata: {
          name: config.name,
          namespace: namespace,
          labels: {
            app: config.targetRef.name,
            'deployment-strategy': 'canary',
            'managed-by': 'canary-deployment-manager'
          }
        },
        spec: {
          targetRef: config.targetRef,
          service: config.service,
          analysis: config.analysis
        }
      };

      try {
        // Try to get existing canary
        const existingCanary = await this.customObjectsApi.getNamespacedCustomObject(
          'flagger.app',
          'v1beta1',
          namespace,
          'canaries',
          config.name
        );

        // Update existing canary
        const updatedCanary = await this.customObjectsApi.replaceNamespacedCustomObject(
          'flagger.app',
          'v1beta1',
          namespace,
          'canaries',
          config.name,
          canarySpec
        );

        logger.info(`Updated existing canary resource: ${config.name}`);
        return updatedCanary.body;

      } catch (error) {
        if (error.response && error.response.statusCode === 404) {
          // Create new canary
          const newCanary = await this.customObjectsApi.createNamespacedCustomObject(
            'flagger.app',
            'v1beta1',
            namespace,
            'canaries',
            canarySpec
          );

          logger.info(`Created new canary resource: ${config.name}`);
          return newCanary.body;
        } else {
          throw error;
        }
      }

    } catch (error) {
      logger.error(`Failed to create canary resource: ${config.name}`, error);
      throw error;
    }
  }

  /**
   * Monitor canary deployment progress
   */
  async monitorCanaryProgress(canaryName, namespace, timeoutSeconds) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const monitoringInterval = setInterval(async () => {
        try {
          // Check if timeout exceeded
          if (Date.now() - startTime > timeoutSeconds * 1000) {
            clearInterval(monitoringInterval);
            reject(new Error(`Canary deployment timeout: ${canaryName}`));
            return;
          }

          // Get canary status
          const canaryStatus = await this.getCanaryStatus(canaryName, namespace);
          
          logger.debug(`Canary progress: ${canaryName}`, {
            phase: canaryStatus.phase,
            canaryWeight: canaryStatus.canaryWeight,
            iterations: canaryStatus.iterations,
            message: canaryStatus.lastTransitionTime
          });

          // Check for completion or failure
          if (canaryStatus.phase === 'Succeeded') {
            clearInterval(monitoringInterval);
            
            this.updateCanaryDeploymentStatus(canaryName, 'succeeded', canaryStatus);
            
            resolve({
              success: true,
              phase: 'Succeeded',
              duration: Date.now() - startTime,
              finalStatus: canaryStatus
            });
            return;
          }

          if (canaryStatus.phase === 'Failed') {
            clearInterval(monitoringInterval);
            
            this.updateCanaryDeploymentStatus(canaryName, 'failed', canaryStatus);
            
            reject(new Error(`Canary deployment failed: ${canaryStatus.conditions[0]?.message || 'Unknown error'}`));
            return;
          }

          // Continue monitoring if still progressing
          
        } catch (error) {
          clearInterval(monitoringInterval);
          reject(error);
        }
      }, 10000); // Check every 10 seconds
    });
  }

  /**
   * Get canary deployment status
   */
  async getCanaryStatus(canaryName, namespace) {
    try {
      const canary = await this.customObjectsApi.getNamespacedCustomObject(
        'flagger.app',
        'v1beta1',
        namespace,
        'canaries',
        canaryName
      );

      const status = canary.body.status || {};
      
      return {
        phase: status.phase || 'Unknown',
        canaryWeight: status.canaryWeight || 0,
        iterations: status.iterations || 0,
        lastTransitionTime: status.lastTransitionTime,
        conditions: status.conditions || [],
        failedChecks: status.failedChecks || 0
      };

    } catch (error) {
      logger.error(`Failed to get canary status: ${canaryName}`, error);
      throw error;
    }
  }

  /**
   * Manually promote canary to production
   */
  async promoteCanary(canaryName, namespace = 'default') {
    try {
      logger.info(`Manually promoting canary: ${canaryName}`);

      // Get canary resource
      const canary = await this.customObjectsApi.getNamespacedCustomObject(
        'flagger.app',
        'v1beta1',
        namespace,
        'canaries',
        canaryName
      );

      // Add promotion annotation
      if (!canary.body.metadata.annotations) {
        canary.body.metadata.annotations = {};
      }
      
      canary.body.metadata.annotations['flagger.app/promote'] = 'true';

      // Update canary resource
      await this.customObjectsApi.replaceNamespacedCustomObject(
        'flagger.app',
        'v1beta1',
        namespace,
        'canaries',
        canaryName,
        canary.body
      );

      logger.info(`Canary promotion triggered: ${canaryName}`);

      return { success: true, promoted: true };

    } catch (error) {
      logger.error(`Failed to promote canary: ${canaryName}`, error);
      throw error;
    }
  }

  /**
   * Manually rollback canary deployment
   */
  async rollbackCanary(canaryName, namespace = 'default') {
    try {
      logger.info(`Rolling back canary deployment: ${canaryName}`);

      // Get canary resource
      const canary = await this.customObjectsApi.getNamespacedCustomObject(
        'flagger.app',
        'v1beta1',
        namespace,
        'canaries',
        canaryName
      );

      // Add rollback annotation
      if (!canary.body.metadata.annotations) {
        canary.body.metadata.annotations = {};
      }
      
      canary.body.metadata.annotations['flagger.app/rollback'] = 'true';

      // Update canary resource
      await this.customObjectsApi.replaceNamespacedCustomObject(
        'flagger.app',
        'v1beta1',
        namespace,
        'canaries',
        canaryName,
        canary.body
      );

      logger.info(`Canary rollback triggered: ${canaryName}`);

      return { success: true, rolledBack: true };

    } catch (error) {
      logger.error(`Failed to rollback canary: ${canaryName}`, error);
      throw error;
    }
  }

  /**
   * Run canary analysis with custom metrics
   */
  async runCanaryAnalysis(deploymentName, namespace = 'default') {
    try {
      const analysis = {
        deploymentName,
        timestamp: new Date(),
        metrics: {},
        webhooks: {},
        overall: { success: true, score: 0 }
      };

      // Collect Prometheus metrics
      const metricsResults = await this.collectPrometheusMetrics(deploymentName, namespace);
      analysis.metrics = metricsResults;

      // Run webhook validations
      const webhookResults = await this.runWebhookValidations(deploymentName, namespace);
      analysis.webhooks = webhookResults;

      // Calculate overall score
      analysis.overall.score = this.calculateCanaryScore(metricsResults, webhookResults);
      analysis.overall.success = analysis.overall.score >= 80; // 80% threshold

      logger.debug(`Canary analysis completed for ${deploymentName}`, {
        score: analysis.overall.score,
        success: analysis.overall.success
      });

      return analysis;

    } catch (error) {
      logger.error(`Canary analysis failed for ${deploymentName}:`, error);
      return {
        deploymentName,
        timestamp: new Date(),
        overall: { success: false, score: 0 },
        error: error.message
      };
    }
  }

  /**
   * Get default metrics for canary analysis
   */
  getDefaultMetrics() {
    return [
      {
        name: 'request-success-rate',
        thresholdRange: { min: 99 },
        interval: '1m'
      },
      {
        name: 'request-duration',
        thresholdRange: { max: 500 },
        interval: '1m'
      },
      {
        name: 'error-rate',
        thresholdRange: { max: 1 },
        interval: '1m'
      }
    ];
  }

  /**
   * Get default webhooks for validation
   */
  getDefaultWebhooks(deploymentName) {
    return [
      {
        name: 'health-check',
        type: 'pre-rollout',
        url: `http://${deploymentName}-canary/health`,
        timeout: '30s'
      },
      {
        name: 'integration-test',
        type: 'rollout',
        url: `http://test-runner/run-integration-tests`,
        timeout: '60s',
        metadata: {
          target: `${deploymentName}-canary`
        }
      }
    ];
  }

  // Helper methods
  async updateDeploymentImage(deploymentName, newImage, namespace) {
    try {
      const deployment = await this.appsApi.readNamespacedDeployment(deploymentName, namespace);
      deployment.body.spec.template.spec.containers[0].image = newImage;
      
      await this.appsApi.replaceNamespacedDeployment(deploymentName, namespace, deployment.body);
      logger.debug(`Updated deployment image: ${deploymentName} -> ${newImage}`);
      
    } catch (error) {
      logger.error(`Failed to update deployment image: ${deploymentName}`, error);
      throw error;
    }
  }

  updateCanaryDeploymentStatus(canaryName, status, statusData) {
    const deployment = this.canaryDeployments.get(canaryName);
    if (deployment) {
      deployment.status = status;
      deployment.endTime = new Date();
      deployment.duration = deployment.endTime - deployment.startTime;
      deployment.finalStatus = statusData;
    }
  }

  async collectPrometheusMetrics(deploymentName, namespace) {
    // Implementation would query Prometheus for specific metrics
    return {
      successRate: 99.5,
      errorRate: 0.5,
      responseTime: 245,
      requestVolume: 1250
    };
  }

  async runWebhookValidations(deploymentName, namespace) {
    // Implementation would execute webhook validations
    return {
      healthCheck: { success: true, responseTime: 50 },
      integrationTests: { success: true, testsRun: 25, testsPassed: 25 }
    };
  }

  calculateCanaryScore(metrics, webhooks) {
    let score = 0;
    let totalChecks = 0;

    // Metrics scoring
    if (metrics.successRate >= 99) score += 30; else if (metrics.successRate >= 95) score += 20; else score += 10;
    if (metrics.errorRate <= 1) score += 20; else if (metrics.errorRate <= 5) score += 10; else score += 0;
    if (metrics.responseTime <= 500) score += 20; else if (metrics.responseTime <= 1000) score += 10; else score += 0;
    totalChecks += 3;

    // Webhook scoring
    if (webhooks.healthCheck?.success) score += 15;
    if (webhooks.integrationTests?.success) score += 15;
    totalChecks += 2;

    return Math.round((score / (totalChecks * 20)) * 100);
  }

  getCanaryDeployments() {
    return Array.from(this.canaryDeployments.values());
  }

  getCanaryDeployment(canaryName) {
    return this.canaryDeployments.get(canaryName);
  }
}

// Export singleton instance
export const canaryDeploymentManager = new CanaryDeploymentManager();
