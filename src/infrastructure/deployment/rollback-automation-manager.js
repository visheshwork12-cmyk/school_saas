// src/infrastructure/deployment/rollback-automation-manager.js
import k8s from "@kubernetes/client-node";
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";

/**
 * Rollback Automation Manager
 * Manages automated rollbacks based on health checks and metrics
 */
export class RollbackAutomationManager extends EventEmitter {
  constructor() {
    super();
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromDefault();
    this.k8sApi = this.k8sConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.k8sConfig.makeApiClient(k8s.AppsV1Api);
    
    this.rollbackConfigurations = new Map();
    this.activeMonitors = new Map();
    this.rollbackHistory = [];
    this.initializeRollbackConfigurations();
  }

  /**
   * Initialize rollback configurations
   */
  initializeRollbackConfigurations() {
    // Health-based rollback configuration
    this.addRollbackConfiguration('HEALTH_BASED', {
      name: 'Health Check Rollback',
      enabled: true,
      triggers: {
        consecutiveFailures: 3,
        failureRate: 50, // 50% failure rate
        timeWindow: 300 // 5 minutes
      },
      checks: [
        {
          type: 'readiness',
          threshold: 80, // 80% pods must be ready
          interval: 30
        },
        {
          type: 'liveness',
          threshold: 90, // 90% pods must pass liveness
          interval: 60
        }
      ]
    });

    // Performance-based rollback configuration
    this.addRollbackConfiguration('PERFORMANCE_BASED', {
      name: 'Performance Metrics Rollback',
      enabled: true,
      triggers: {
        responseTimeThreshold: 2000, // 2 seconds
        errorRateThreshold: 5, // 5% error rate
        consecutiveViolations: 2,
        evaluationPeriod: 180 // 3 minutes
      },
      metrics: [
        {
          name: 'response_time',
          query: 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))',
          threshold: 2.0,
          comparison: 'greater_than'
        },
        {
          name: 'error_rate',
          query: 'rate(http_requests_total{status=~"5.."}[5m])',
          threshold: 0.05,
          comparison: 'greater_than'
        }
      ]
    });

    // Business metrics rollback configuration
    this.addRollbackConfiguration('BUSINESS_METRICS', {
      name: 'Business Metrics Rollback',
      enabled: true,
      triggers: {
        conversionRateDropThreshold: 20, // 20% drop in conversion
        userEngagementThreshold: 15, // 15% drop in engagement
        revenueImpactThreshold: 10 // 10% revenue impact
      },
      metrics: [
        {
          name: 'user_registrations',
          baseline: 'avg_over_time(user_registrations[24h])',
          threshold: 0.8, // 80% of baseline
          comparison: 'less_than'
        }
      ]
    });
  }

  /**
   * Enable automatic rollback monitoring for deployment
   */
  async enableAutomaticRollback(deploymentName, namespace = 'default', config = {}) {
    try {
      logger.info(`Enabling automatic rollback for deployment: ${deploymentName}`);

      const rollbackConfig = {
        deploymentName,
        namespace,
        enabled: true,
        configurations: config.configurations || ['HEALTH_BASED', 'PERFORMANCE_BASED'],
        cooldownPeriod: config.cooldownPeriod || 300, // 5 minutes between rollbacks
        maxRollbacks: config.maxRollbacks || 3, // Max 3 rollbacks per hour
        notificationChannels: config.notificationChannels || []
      };

      // Start monitoring
      const monitor = await this.startDeploymentMonitoring(rollbackConfig);
      this.activeMonitors.set(deploymentName, monitor);

      logger.info(`Automatic rollback enabled for ${deploymentName}`);

      return {
        success: true,
        deploymentName,
        monitorId: monitor.id,
        configurations: rollbackConfig.configurations
      };

    } catch (error) {
      logger.error(`Failed to enable automatic rollback for ${deploymentName}:`, error);
      throw error;
    }
  }

  /**
   * Start deployment monitoring for automated rollbacks
   */
  async startDeploymentMonitoring(config) {
    const monitor = {
      id: `monitor-${config.deploymentName}-${Date.now()}`,
      config,
      startTime: new Date(),
      checks: new Map(),
      violations: [],
      lastRollback: null,
      rollbackCount: 0
    };

    // Start health monitoring
    if (config.configurations.includes('HEALTH_BASED')) {
      monitor.healthMonitor = setInterval(async () => {
        await this.performHealthCheck(monitor);
      }, 30000); // Every 30 seconds
    }

    // Start performance monitoring
    if (config.configurations.includes('PERFORMANCE_BASED')) {
      monitor.performanceMonitor = setInterval(async () => {
        await this.performPerformanceCheck(monitor);
      }, 60000); // Every minute
    }

    // Start business metrics monitoring
    if (config.configurations.includes('BUSINESS_METRICS')) {
      monitor.businessMonitor = setInterval(async () => {
        await this.performBusinessMetricsCheck(monitor);
      }, 120000); // Every 2 minutes
    }

    logger.debug(`Monitoring started for deployment: ${config.deploymentName}`);
    return monitor;
  }

  /**
   * Perform health check monitoring
   */
  async performHealthCheck(monitor) {
    try {
      const healthConfig = this.rollbackConfigurations.get('HEALTH_BASED');
      const deployment = await this.appsApi.readNamespacedDeployment(
        monitor.config.deploymentName,
        monitor.config.namespace
      );

      const status = deployment.body.status;
      const spec = deployment.body.spec;

      const healthMetrics = {
        timestamp: new Date(),
        totalReplicas: spec.replicas || 0,
        readyReplicas: status.readyReplicas || 0,
        availableReplicas: status.availableReplicas || 0,
        updatedReplicas: status.updatedReplicas || 0
      };

      // Calculate health percentages
      healthMetrics.readinessPercentage = healthMetrics.totalReplicas > 0 
        ? (healthMetrics.readyReplicas / healthMetrics.totalReplicas) * 100 
        : 0;

      healthMetrics.availabilityPercentage = healthMetrics.totalReplicas > 0
        ? (healthMetrics.availableReplicas / healthMetrics.totalReplicas) * 100
        : 0;

      // Check against thresholds
      const readinessCheck = healthConfig.checks.find(c => c.type === 'readiness');
      const livenessCheck = healthConfig.checks.find(c => c.type === 'liveness');

      if (readinessCheck && healthMetrics.readinessPercentage < readinessCheck.threshold) {
        await this.recordViolation(monitor, 'health', 'readiness', {
          actual: healthMetrics.readinessPercentage,
          threshold: readinessCheck.threshold,
          severity: 'high'
        });
      }

      if (livenessCheck && healthMetrics.availabilityPercentage < livenessCheck.threshold) {
        await this.recordViolation(monitor, 'health', 'liveness', {
          actual: healthMetrics.availabilityPercentage,
          threshold: livenessCheck.threshold,
          severity: 'high'
        });
      }

      // Store health metrics
      monitor.checks.set('health', healthMetrics);

    } catch (error) {
      logger.error(`Health check failed for ${monitor.config.deploymentName}:`, error);
      
      await this.recordViolation(monitor, 'health', 'check_failure', {
        error: error.message,
        severity: 'critical'
      });
    }
  }

  /**
   * Perform performance metrics check
   */
  async performPerformanceCheck(monitor) {
    try {
      const performanceConfig = this.rollbackConfigurations.get('PERFORMANCE_BASED');
      
      // This would typically query Prometheus or other monitoring system
      const performanceMetrics = await this.collectPerformanceMetrics(
        monitor.config.deploymentName,
        monitor.config.namespace
      );

      // Check each performance metric
      for (const metricConfig of performanceConfig.metrics) {
        const metricValue = performanceMetrics[metricConfig.name];
        
        if (metricValue !== undefined) {
          const violated = this.checkMetricViolation(metricValue, metricConfig);
          
          if (violated) {
            await this.recordViolation(monitor, 'performance', metricConfig.name, {
              actual: metricValue,
              threshold: metricConfig.threshold,
              comparison: metricConfig.comparison,
              severity: 'medium'
            });
          }
        }
      }

      // Store performance metrics
      monitor.checks.set('performance', performanceMetrics);

    } catch (error) {
      logger.error(`Performance check failed for ${monitor.config.deploymentName}:`, error);
    }
  }

  /**
   * Record a violation and check if rollback should be triggered
   */
  async recordViolation(monitor, category, type, details) {
    const violation = {
      timestamp: new Date(),
      category,
      type,
      details
    };

    monitor.violations.push(violation);

    // Keep only recent violations (last hour)
    const oneHourAgo = new Date(Date.now() - 3600000);
    monitor.violations = monitor.violations.filter(v => v.timestamp > oneHourAgo);

    logger.warn(`Violation recorded for ${monitor.config.deploymentName}:`, violation);

    // Check if rollback should be triggered
    await this.evaluateRollbackTriggers(monitor);
  }

  /**
   * Evaluate if rollback should be triggered based on violations
   */
  async evaluateRollbackTriggers(monitor) {
    try {
      const config = monitor.config;
      const now = new Date();
      
      // Check cooldown period
      if (monitor.lastRollback && 
          (now - monitor.lastRollback) < (config.cooldownPeriod * 1000)) {
        logger.debug(`Rollback cooldown active for ${config.deploymentName}`);
        return;
      }

      // Check max rollbacks limit
      const oneHourAgo = new Date(now.getTime() - 3600000);
      const recentRollbacks = this.rollbackHistory.filter(
        r => r.deploymentName === config.deploymentName && 
            r.timestamp > oneHourAgo
      );
      
      if (recentRollbacks.length >= config.maxRollbacks) {
        logger.warn(`Max rollback limit reached for ${config.deploymentName}`);
        return;
      }

      // Evaluate specific rollback conditions
      const shouldRollback = await this.shouldTriggerRollback(monitor);
      
      if (shouldRollback.trigger) {
        logger.warn(`Triggering automatic rollback for ${config.deploymentName}`, shouldRollback);
        await this.executeAutomaticRollback(monitor, shouldRollback.reason);
      }

    } catch (error) {
      logger.error(`Failed to evaluate rollback triggers for ${monitor.config.deploymentName}:`, error);
    }
  }

  /**
   * Determine if rollback should be triggered
   */
  async shouldTriggerRollback(monitor) {
    const recentViolations = monitor.violations.filter(
      v => (new Date() - v.timestamp) < 300000 // Last 5 minutes
    );

    // Health-based trigger
    const criticalHealthViolations = recentViolations.filter(
      v => v.category === 'health' && v.details.severity === 'critical'
    );

    if (criticalHealthViolations.length >= 2) {
      return {
        trigger: true,
        reason: 'critical_health_failures',
        details: { criticalFailures: criticalHealthViolations.length }
      };
    }

    // Performance-based trigger
    const performanceViolations = recentViolations.filter(
      v => v.category === 'performance'
    );

    if (performanceViolations.length >= 3) {
      return {
        trigger: true,
        reason: 'performance_degradation',
        details: { performanceViolations: performanceViolations.length }
      };
    }

    // Combined violations trigger
    if (recentViolations.length >= 5) {
      return {
        trigger: true,
        reason: 'multiple_violations',
        details: { totalViolations: recentViolations.length }
      };
    }

    return { trigger: false };
  }

  /**
   * Execute automatic rollback
   */
  async executeAutomaticRollback(monitor, reason) {
    try {
      const { deploymentName, namespace } = monitor.config;
      
      logger.info(`Executing automatic rollback for ${deploymentName}, reason: ${reason}`);

      // Get deployment rollout history
      const deployment = await this.appsApi.readNamespacedDeployment(deploymentName, namespace);
      const currentRevision = deployment.body.metadata.annotations?.['deployment.kubernetes.io/revision'];

      // Perform rollback to previous revision
      const rollbackResult = await this.performKubernetesRollback(deploymentName, namespace);

      // Update monitor state
      monitor.lastRollback = new Date();
      monitor.rollbackCount++;

      // Record rollback in history
      const rollbackRecord = {
        deploymentName,
        namespace,
        timestamp: new Date(),
        reason,
        fromRevision: currentRevision,
        toRevision: rollbackResult.toRevision,
        success: rollbackResult.success,
        violations: monitor.violations.slice(-10) // Last 10 violations
      };

      this.rollbackHistory.push(rollbackRecord);

      // Send notifications
      await this.sendRollbackNotifications(rollbackRecord);

      // Emit rollback event
      this.emit('rollbackExecuted', rollbackRecord);

      logger.info(`Automatic rollback completed for ${deploymentName}`, rollbackRecord);

      return rollbackRecord;

    } catch (error) {
      logger.error(`Automatic rollback failed for ${monitor.config.deploymentName}:`, error);
      
      // Record failed rollback
      this.rollbackHistory.push({
        deploymentName: monitor.config.deploymentName,
        namespace: monitor.config.namespace,
        timestamp: new Date(),
        reason,
        success: false,
        error: error.message
      });

      throw error;
    }
  }

  /**
   * Perform Kubernetes deployment rollback
   */
  async performKubernetesRollback(deploymentName, namespace) {
    try {
      // Get rollout history
      const replicaSets = await this.appsApi.listNamespacedReplicaSet(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deploymentName}`
      );

      // Find previous revision
      const sortedReplicaSets = replicaSets.body.items
        .filter(rs => rs.metadata.annotations?.['deployment.kubernetes.io/revision'])
        .sort((a, b) => {
          const revA = parseInt(a.metadata.annotations['deployment.kubernetes.io/revision']);
          const revB = parseInt(b.metadata.annotations['deployment.kubernetes.io/revision']);
          return revB - revA;
        });

      if (sortedReplicaSets.length < 2) {
        throw new Error('No previous revision available for rollback');
      }

      const previousRS = sortedReplicaSets[1]; // Second most recent (previous)
      const targetRevision = previousRS.metadata.annotations['deployment.kubernetes.io/revision'];

      // Execute rollback using kubectl rollout undo
      const { execSync } = await import('child_process');
      const rollbackCommand = `kubectl rollout undo deployment/${deploymentName} --namespace=${namespace} --to-revision=${targetRevision}`;
      
      execSync(rollbackCommand, { stdio: 'inherit' });

      // Wait for rollback to complete
      await this.waitForRolloutComplete(deploymentName, namespace);

      logger.info(`Kubernetes rollback completed for ${deploymentName} to revision ${targetRevision}`);

      return {
        success: true,
        toRevision: targetRevision,
        method: 'kubectl_rollout_undo'
      };

    } catch (error) {
      logger.error(`Kubernetes rollback failed for ${deploymentName}:`, error);
      throw error;
    }
  }

  /**
   * Wait for rollout to complete
   */
  async waitForRolloutComplete(deploymentName, namespace, timeoutSeconds = 300) {
    const startTime = Date.now();
    
    while ((Date.now() - startTime) < timeoutSeconds * 1000) {
      try {
        const deployment = await this.appsApi.readNamespacedDeployment(deploymentName, namespace);
        const status = deployment.body.status;
        
        if (status.readyReplicas === status.replicas && 
            status.updatedReplicas === status.replicas &&
            status.availableReplicas === status.replicas) {
          logger.debug(`Rollout completed for ${deploymentName}`);
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
      } catch (error) {
        logger.warn(`Error checking rollout status: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    throw new Error(`Rollout did not complete within ${timeoutSeconds} seconds`);
  }

  /**
   * Disable automatic rollback for deployment
   */
  async disableAutomaticRollback(deploymentName) {
    try {
      const monitor = this.activeMonitors.get(deploymentName);
      
      if (monitor) {
        // Clear intervals
        if (monitor.healthMonitor) clearInterval(monitor.healthMonitor);
        if (monitor.performanceMonitor) clearInterval(monitor.performanceMonitor);
        if (monitor.businessMonitor) clearInterval(monitor.businessMonitor);
        
        this.activeMonitors.delete(deploymentName);
        
        logger.info(`Automatic rollback disabled for ${deploymentName}`);
        return { success: true, disabled: true };
      } else {
        return { success: true, message: 'No active monitor found' };
      }

    } catch (error) {
      logger.error(`Failed to disable automatic rollback for ${deploymentName}:`, error);
      throw error;
    }
  }

  // Helper methods
  addRollbackConfiguration(configId, config) {
    this.rollbackConfigurations.set(configId, config);
  }

  async collectPerformanceMetrics(deploymentName, namespace) {
    // Simulate performance metrics collection
    // In production, this would query Prometheus or other monitoring
    return {
      response_time: Math.random() * 1000 + 200, // 200-1200ms
      error_rate: Math.random() * 0.1, // 0-10%
      throughput: Math.random() * 1000 + 500 // 500-1500 RPS
    };
  }

  checkMetricViolation(value, config) {
    switch (config.comparison) {
      case 'greater_than':
        return value > config.threshold;
      case 'less_than':
        return value < config.threshold;
      case 'equals':
        return value === config.threshold;
      default:
        return false;
    }
  }

  async performBusinessMetricsCheck(monitor) {
    // Implementation for business metrics monitoring
    logger.debug(`Business metrics check for ${monitor.config.deploymentName}`);
  }

  async sendRollbackNotifications(rollbackRecord) {
    // Implementation for sending notifications (Slack, email, etc.)
    logger.info(`Rollback notification sent for ${rollbackRecord.deploymentName}`);
  }

  getActiveMonitors() {
    return Array.from(this.activeMonitors.values());
  }

  getRollbackHistory(deploymentName = null, limit = 50) {
    let history = this.rollbackHistory;
    
    if (deploymentName) {
      history = history.filter(r => r.deploymentName === deploymentName);
    }
    
    return history
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  getMonitoringStatus(deploymentName) {
    return this.activeMonitors.get(deploymentName);
  }
}

// Export singleton instance
export const rollbackAutomationManager = new RollbackAutomationManager();
