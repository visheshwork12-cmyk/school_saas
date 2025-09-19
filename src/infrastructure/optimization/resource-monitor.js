// src/infrastructure/optimization/resource-monitor.js
import k8s from "@kubernetes/client-node";
import { logger } from "#utils/core/logger.js";

/**
 * Container Resource Monitor and Optimizer
 * Monitors and optimizes container resource usage
 */
export class ResourceMonitor {
  constructor() {
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromDefault();
    this.k8sApi = this.k8sConfig.makeApiClient(k8s.CoreV1Api);
    this.metricsApi = this.k8sConfig.makeApiClient(k8s.MetricsV1beta1Api);
    
    this.resourceMetrics = new Map();
    this.optimizationRecommendations = new Map();
    this.monitoringInterval = null;
  }

  /**
   * Start resource monitoring
   */
  startResourceMonitoring(intervalMs = 60000) {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.collectResourceMetrics();
        await this.analyzeResourceUsage();
        await this.generateOptimizationRecommendations();
      } catch (error) {
        logger.error('Resource monitoring failed:', error);
      }
    }, intervalMs);

    logger.info('Resource monitoring started');
  }

  /**
   * Collect resource metrics from Kubernetes
   */
  async collectResourceMetrics() {
    try {
      // Get pod metrics
      const podMetrics = await this.metricsApi.listPodMetricsForAllNamespaces();
      
      // Get node metrics
      const nodeMetrics = await this.metricsApi.listNodeMetrics();

      // Process pod metrics
      for (const podMetric of podMetrics.body.items) {
        const podKey = `${podMetric.metadata.namespace}/${podMetric.metadata.name}`;
        
        const metrics = {
          namespace: podMetric.metadata.namespace,
          podName: podMetric.metadata.name,
          timestamp: new Date(),
          containers: {}
        };

        for (const container of podMetric.containers) {
          metrics.containers[container.name] = {
            cpu: this.parseCpuMetric(container.usage.cpu),
            memory: this.parseMemoryMetric(container.usage.memory)
          };
        }

        this.resourceMetrics.set(podKey, metrics);
      }

      // Process node metrics
      for (const nodeMetric of nodeMetrics.body.items) {
        const nodeKey = `node/${nodeMetric.metadata.name}`;
        
        this.resourceMetrics.set(nodeKey, {
          nodeName: nodeMetric.metadata.name,
          timestamp: new Date(),
          cpu: this.parseCpuMetric(nodeMetric.usage.cpu),
          memory: this.parseMemoryMetric(nodeMetric.usage.memory)
        });
      }

    } catch (error) {
      logger.error('Failed to collect resource metrics:', error);
    }
  }

  /**
   * Analyze resource usage patterns
   */
  async analyzeResourceUsage() {
    const analysis = {
      overUtilized: [],
      underUtilized: [],
      optimizationOpportunities: []
    };

    for (const [podKey, metrics] of this.resourceMetrics) {
      if (podKey.startsWith('node/')) continue;

      try {
        // Get pod specification for comparison
        const [namespace, podName] = podKey.split('/');
        const podSpec = await this.k8sApi.readNamespacedPod(podName, namespace);
        
        const containers = podSpec.body.spec.containers;
        
        for (const containerName of Object.keys(metrics.containers)) {
          const containerMetrics = metrics.containers[containerName];
          const containerSpec = containers.find(c => c.name === containerName);
          
          if (!containerSpec || !containerSpec.resources) continue;

          const requests = containerSpec.resources.requests || {};
          const limits = containerSpec.resources.limits || {};

          // Analyze CPU usage
          if (requests.cpu) {
            const cpuRequest = this.parseCpuMetric(requests.cpu);
            const cpuUsage = containerMetrics.cpu;
            const cpuUtilization = (cpuUsage / cpuRequest) * 100;

            if (cpuUtilization > 80) {
              analysis.overUtilized.push({
                pod: podKey,
                container: containerName,
                resource: 'cpu',
                utilization: cpuUtilization,
                current: cpuUsage,
                request: cpuRequest
              });
            } else if (cpuUtilization < 20) {
              analysis.underUtilized.push({
                pod: podKey,
                container: containerName,
                resource: 'cpu',
                utilization: cpuUtilization,
                current: cpuUsage,
                request: cpuRequest
              });
            }
          }

          // Analyze Memory usage
          if (requests.memory) {
            const memoryRequest = this.parseMemoryMetric(requests.memory);
            const memoryUsage = containerMetrics.memory;
            const memoryUtilization = (memoryUsage / memoryRequest) * 100;

            if (memoryUtilization > 85) {
              analysis.overUtilized.push({
                pod: podKey,
                container: containerName,
                resource: 'memory',
                utilization: memoryUtilization,
                current: memoryUsage,
                request: memoryRequest
              });
            } else if (memoryUtilization < 30) {
              analysis.underUtilized.push({
                pod: podKey,
                container: containerName,
                resource: 'memory',
                utilization: memoryUtilization,
                current: memoryUsage,
                request: memoryRequest
              });
            }
          }
        }

      } catch (error) {
        logger.warn(`Failed to analyze pod ${podKey}:`, error.message);
      }
    }

    this.resourceAnalysis = analysis;
    return analysis;
  }

  /**
   * Generate optimization recommendations
   */
  async generateOptimizationRecommendations() {
    const recommendations = [];

    if (!this.resourceAnalysis) return recommendations;

    // Recommendations for over-utilized resources
    for (const overUtil of this.resourceAnalysis.overUtilized) {
      const recommendation = {
        type: 'INCREASE_RESOURCES',
        priority: 'HIGH',
        pod: overUtil.pod,
        container: overUtil.container,
        resource: overUtil.resource,
        currentValue: overUtil.request,
        recommendedValue: this.calculateRecommendedIncrease(overUtil),
        reason: `${overUtil.resource} utilization is ${overUtil.utilization.toFixed(1)}%`,
        estimatedImpact: 'Improved performance and stability'
      };
      recommendations.push(recommendation);
    }

    // Recommendations for under-utilized resources
    for (const underUtil of this.resourceAnalysis.underUtilized) {
      const recommendation = {
        type: 'DECREASE_RESOURCES',
        priority: 'MEDIUM',
        pod: underUtil.pod,
        container: underUtil.container,
        resource: underUtil.resource,
        currentValue: underUtil.request,
        recommendedValue: this.calculateRecommendedDecrease(underUtil),
        reason: `${underUtil.resource} utilization is only ${underUtil.utilization.toFixed(1)}%`,
        estimatedImpact: 'Cost savings and better resource allocation'
      };
      recommendations.push(recommendation);
    }

    this.optimizationRecommendations.set(Date.now(), recommendations);
    
    if (recommendations.length > 0) {
      logger.info(`Generated ${recommendations.length} resource optimization recommendations`);
    }

    return recommendations;
  }

  /**
   * Apply resource optimization recommendations
   */
  async applyOptimizationRecommendations(recommendations, options = { dryRun: true }) {
    const results = [];

    for (const recommendation of recommendations) {
      try {
        const result = await this.applyRecommendation(recommendation, options);
        results.push(result);
      } catch (error) {
        logger.error(`Failed to apply recommendation:`, error);
        results.push({
          recommendation,
          status: 'failed',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Apply individual recommendation
   */
  async applyRecommendation(recommendation, options) {
    const [namespace, podName] = recommendation.pod.split('/');
    
    // Get the deployment that owns this pod
    const pod = await this.k8sApi.readNamespacedPod(podName, namespace);
    const ownerRef = pod.body.metadata.ownerReferences?.[0];
    
    if (!ownerRef || ownerRef.kind !== 'ReplicaSet') {
      throw new Error('Pod is not managed by a Deployment');
    }

    // Get the ReplicaSet and then the Deployment
    const replicaSet = await this.k8sApi.readNamespacedReplicaSet(ownerRef.name, namespace);
    const deploymentOwnerRef = replicaSet.body.metadata.ownerReferences?.[0];
    
    if (!deploymentOwnerRef || deploymentOwnerRef.kind !== 'Deployment') {
      throw new Error('ReplicaSet is not managed by a Deployment');
    }

    // Get and update the Deployment
    const appsApi = this.k8sConfig.makeApiClient(k8s.AppsV1Api);
    const deployment = await appsApi.readNamespacedDeployment(deploymentOwnerRef.name, namespace);
    
    // Update container resources
    const containers = deployment.body.spec.template.spec.containers;
    const container = containers.find(c => c.name === recommendation.container);
    
    if (!container) {
      throw new Error(`Container ${recommendation.container} not found`);
    }

    if (!container.resources) {
      container.resources = {};
    }
    if (!container.resources.requests) {
      container.resources.requests = {};
    }
    if (!container.resources.limits) {
      container.resources.limits = {};
    }

    // Apply the recommendation
    container.resources.requests[recommendation.resource] = recommendation.recommendedValue;
    
    // Also update limits proportionally
    if (recommendation.resource === 'cpu') {
      const cpuLimit = this.parseCpuMetric(container.resources.limits.cpu || '1000m');
      const newCpuLimit = Math.max(
        this.parseCpuMetric(recommendation.recommendedValue) * 2,
        cpuLimit
      );
      container.resources.limits.cpu = `${newCpuLimit}m`;
    } else if (recommendation.resource === 'memory') {
      const memoryLimit = this.parseMemoryMetric(container.resources.limits.memory || '1Gi');
      const newMemoryLimit = Math.max(
        this.parseMemoryMetric(recommendation.recommendedValue) * 1.5,
        memoryLimit
      );
      container.resources.limits.memory = `${Math.round(newMemoryLimit / 1024 / 1024)}Mi`;
    }

    if (!options.dryRun) {
      // Apply the changes
      await appsApi.replaceNamespacedDeployment(
        deploymentOwnerRef.name,
        namespace,
        deployment.body
      );
    }

    return {
      recommendation,
      status: 'applied',
      dryRun: options.dryRun,
      deployment: deploymentOwnerRef.name
    };
  }

  // Helper methods
  parseCpuMetric(cpuString) {
    if (cpuString.endsWith('m')) {
      return parseInt(cpuString.slice(0, -1));
    } else if (cpuString.endsWith('n')) {
      return parseInt(cpuString.slice(0, -1)) / 1000000;
    } else {
      return parseFloat(cpuString) * 1000;
    }
  }

  parseMemoryMetric(memoryString) {
    const units = {
      'Ki': 1024,
      'Mi': 1024 * 1024,
      'Gi': 1024 * 1024 * 1024,
      'Ti': 1024 * 1024 * 1024 * 1024
    };

    for (const [unit, multiplier] of Object.entries(units)) {
      if (memoryString.endsWith(unit)) {
        return parseInt(memoryString.slice(0, -2)) * multiplier;
      }
    }

    // Default to bytes
    return parseInt(memoryString);
  }

  calculateRecommendedIncrease(utilization) {
    const currentRequest = utilization.request;
    const utilizationPercent = utilization.utilization;
    
    // Increase by 20-50% based on over-utilization
    let increasePercent = 0.2;
    if (utilizationPercent > 90) {
      increasePercent = 0.5;
    } else if (utilizationPercent > 85) {
      increasePercent = 0.3;
    }

    const newValue = Math.ceil(currentRequest * (1 + increasePercent));
    
    if (utilization.resource === 'cpu') {
      return `${newValue}m`;
    } else {
      return `${Math.ceil(newValue / 1024 / 1024)}Mi`;
    }
  }

  calculateRecommendedDecrease(utilization) {
    const currentRequest = utilization.request;
    const currentUsage = utilization.current;
    
    // Set new request to 120% of current usage, with minimum thresholds
    const newValue = Math.max(currentUsage * 1.2, currentRequest * 0.5);
    
    if (utilization.resource === 'cpu') {
      return `${Math.max(50, Math.ceil(newValue))}m`; // Minimum 50m CPU
    } else {
      return `${Math.max(64, Math.ceil(newValue / 1024 / 1024))}Mi`; // Minimum 64Mi memory
    }
  }
}

// Export singleton instance
export const resourceMonitor = new ResourceMonitor();
