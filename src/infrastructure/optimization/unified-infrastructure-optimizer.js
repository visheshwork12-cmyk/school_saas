// src/infrastructure/optimization/unified-infrastructure-optimizer.js
import { autoScalingManager } from "./auto-scaling-manager.js";
import { loadBalancerOptimizer } from "./load-balancer-optimizer.js";
import { resourceMonitor } from "./resource-monitor.js";
import { hpaVpaManager } from "./hpa-vpa-manager.js";
import { awsServicesOptimizer } from "./aws-services-optimizer.js";
import { logger } from "#utils/core/logger.js";

/**
 * Unified Infrastructure Optimization Service
 * Orchestrates all infrastructure optimization strategies
 */
export class UnifiedInfrastructureOptimizer {
  constructor() {
    this.optimizers = {
      autoScaling: autoScalingManager,
      loadBalancer: loadBalancerOptimizer,
      resources: resourceMonitor,
      hpaVpa: hpaVpaManager,
      awsServices: awsServicesOptimizer
    };
    this.optimizationHistory = [];
  }

  /**
   * Execute comprehensive infrastructure optimization
   */
  async executeCompleteOptimization(options = {}) {
    try {
      logger.info('Starting comprehensive infrastructure optimization');

      const results = {
        startedAt: new Date(),
        optimizations: {},
        summary: {
          totalOptimizations: 0,
          costSavings: 0,
          performanceGains: 0,
          recommendations: []
        }
      };

      // 1. Auto-scaling optimization
      if (options.autoScaling !== false) {
        logger.info('Optimizing auto-scaling policies...');
        results.optimizations.autoScaling = await this.optimizeAutoScaling(options.deployments || []);
      }

      // 2. Load balancer optimization
      if (options.loadBalancer !== false) {
        logger.info('Optimizing load balancers...');
        results.optimizations.loadBalancer = await this.optimizeLoadBalancers();
      }

      // 3. Resource optimization
      if (options.resources !== false) {
        logger.info('Optimizing container resources...');
        results.optimizations.resources = await this.optimizeResources();
      }

      // 4. HPA/VPA optimization
      if (options.hpaVpa !== false) {
        logger.info('Optimizing HPA/VPA configurations...');
        results.optimizations.hpaVpa = await this.optimizeHPAVPA(options.deployments || []);
      }

      // 5. AWS services optimization
      if (options.awsServices !== false) {
        logger.info('Optimizing AWS services...');
        results.optimizations.awsServices = await this.optimizeAWSServices();
      }

      results.completedAt = new Date();
      results.duration = results.completedAt - results.startedAt;

      // Generate comprehensive report
      const report = await this.generateInfrastructureReport(results);

      // Store optimization history
      this.storeOptimizationHistory(results);

      logger.info('Infrastructure optimization completed', {
        duration: results.duration,
        optimizations: Object.keys(results.optimizations).length
      });

      return report;

    } catch (error) {
      logger.error('Infrastructure optimization failed:', error);
      throw error;
    }
  }

  /**
   * Optimize auto-scaling policies
   */
  async optimizeAutoScaling(deployments) {
    const results = {
      hpasCreated: 0,
      policiesOptimized: 0,
      recommendations: []
    };

    for (const deployment of deployments) {
      try {
        // Create HPA for deployment
        await autoScalingManager.createHorizontalPodAutoscaler(
          deployment.name,
          deployment.namespace || 'default',
          'API_SERVER'
        );
        results.hpasCreated++;

        // Configure AWS Auto Scaling if needed
        if (deployment.awsAutoScalingGroup) {
          await autoScalingManager.configureAWSAutoScaling(deployment.awsAutoScalingGroup);
          results.policiesOptimized++;
        }

      } catch (error) {
        logger.warn(`Failed to optimize auto-scaling for ${deployment.name}:`, error.message);
        results.recommendations.push({
          type: 'AUTO_SCALING_ERROR',
          deployment: deployment.name,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Optimize load balancers
   */
  async optimizeLoadBalancers() {
    const results = {
      optimizationsApplied: 0,
      recommendations: []
    };

    try {
      // Start load balancer monitoring
      await loadBalancerOptimizer.monitorLoadBalancerPerformance();
      results.optimizationsApplied++;

      results.recommendations.push({
        type: 'LOAD_BALANCER_MONITORING',
        message: 'Load balancer monitoring enabled',
        impact: 'Continuous performance optimization'
      });

    } catch (error) {
      logger.error('Load balancer optimization failed:', error);
      results.recommendations.push({
        type: 'LOAD_BALANCER_ERROR',
        error: error.message
      });
    }

    return results;
  }

  /**
   * Optimize container resources
   */
  async optimizeResources() {
    const results = {
      monitoringStarted: false,
      recommendations: []
    };

    try {
      // Start resource monitoring
      resourceMonitor.startResourceMonitoring();
      results.monitoringStarted = true;

      // Generate resource recommendations
      const recommendations = await resourceMonitor.generateOptimizationRecommendations();
      results.recommendations = recommendations;

    } catch (error) {
      logger.error('Resource optimization failed:', error);
      results.recommendations.push({
        type: 'RESOURCE_ERROR',
        error: error.message
      });
    }

    return results;
  }

  /**
   * Optimize HPA/VPA configurations
   */
  async optimizeHPAVPA(deployments) {
    const results = {
      hpasDeployed: 0,
      vpasDeployed: 0,
      recommendations: []
    };

    try {
      // Start HPA/VPA monitoring
      await hpaVpaManager.monitorAutoscalingActivities();

      for (const deployment of deployments) {
        try {
          // Deploy HPA
          await hpaVpaManager.deployHPA('API_SERVER', deployment.namespace || 'default');
          results.hpasDeployed++;

          // Deploy VPA
          await hpaVpaManager.deployVPA('API_SERVER_VPA', deployment.namespace || 'default');
          results.vpasDeployed++;

        } catch (error) {
          logger.warn(`Failed to deploy HPA/VPA for ${deployment.name}:`, error.message);
        }
      }

    } catch (error) {
      logger.error('HPA/VPA optimization failed:', error);
      results.recommendations.push({
        type: 'HPA_VPA_ERROR',
        error: error.message
      });
    }

    return results;
  }

  /**
   * Optimize AWS services
   */
  async optimizeAWSServices() {
    const results = {
      servicesOptimized: 0,
      recommendations: []
    };

    try {
      // Start AWS services monitoring
      await awsServicesOptimizer.monitorAWSServicesPerformance();
      results.servicesOptimized++;

      // Generate AWS optimization recommendations
      const recommendations = await awsServicesOptimizer.generateOptimizationRecommendations();
      results.recommendations = recommendations;

    } catch (error) {
      logger.error('AWS services optimization failed:', error);
      results.recommendations.push({
        type: 'AWS_SERVICES_ERROR',
        error: error.message
      });
    }

    return results;
  }

  /**
   * Generate comprehensive infrastructure report
   */
  async generateInfrastructureReport(results) {
    const report = {
      generatedAt: new Date(),
      executionTime: results.duration,
      summary: {
        totalOptimizations: 0,
        estimatedMonthlySavings: 0,
        performanceImprovements: [],
        criticalRecommendations: []
      },
      optimizations: results.optimizations,
      recommendations: this.consolidateRecommendations(results),
      nextSteps: this.generateNextSteps(results)
    };

    // Calculate totals
    for (const [category, data] of Object.entries(results.optimizations)) {
      if (data.hpasCreated) report.summary.totalOptimizations += data.hpasCreated;
      if (data.vpasDeployed) report.summary.totalOptimizations += data.vpasDeployed;
      if (data.optimizationsApplied) report.summary.totalOptimizations += data.optimizationsApplied;
      if (data.servicesOptimized) report.summary.totalOptimizations += data.servicesOptimized;
    }

    // Estimate savings
    report.summary.estimatedMonthlySavings = this.estimateInfrastructureSavings(results);

    // Save report
    await this.saveInfrastructureReport(report);

    return report;
  }

  /**
   * Consolidate recommendations from all optimizers
   */
  consolidateRecommendations(results) {
    const allRecommendations = [];

    for (const [category, data] of Object.entries(results.optimizations)) {
      if (data.recommendations && Array.isArray(data.recommendations)) {
        data.recommendations.forEach(rec => {
          allRecommendations.push({
            ...rec,
            category,
            timestamp: new Date()
          });
        });
      }
    }

    // Sort by priority
    return allRecommendations.sort((a, b) => {
      const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Generate next steps based on optimization results
   */
  generateNextSteps(results) {
    const steps = [];

    // Critical recommendations first
    const criticalRecs = this.consolidateRecommendations(results)
      .filter(r => r.priority === 'CRITICAL');

    if (criticalRecs.length > 0) {
      steps.push(`Address ${criticalRecs.length} critical infrastructure issues immediately`);
    }

    // Add standard next steps
    steps.push('Monitor auto-scaling performance for 24-48 hours');
    steps.push('Review resource utilization trends weekly');
    steps.push('Optimize AWS costs using generated recommendations');
    steps.push('Set up automated infrastructure optimization pipeline');

    return steps;
  }

  /**
   * Estimate infrastructure cost savings
   */
  estimateInfrastructureSavings(results) {
    let totalSavings = 0;

    // Auto-scaling savings
    if (results.optimizations.autoScaling?.hpasCreated > 0) {
      totalSavings += results.optimizations.autoScaling.hpasCreated * 200; // $200/month per HPA
    }

    // Resource optimization savings
    if (results.optimizations.resources?.monitoringStarted) {
      totalSavings += 500; // $500/month from resource optimization
    }

    // AWS services savings
    if (results.optimizations.awsServices?.recommendations) {
      totalSavings += results.optimizations.awsServices.recommendations.length * 100; // $100/month per optimization
    }

    return totalSavings;
  }

  /**
   * Store optimization history
   */
  storeOptimizationHistory(results) {
    this.optimizationHistory.push({
      timestamp: results.startedAt,
      duration: results.duration,
      optimizations: Object.keys(results.optimizations).length,
      summary: results.summary
    });

    // Keep only last 50 entries
    if (this.optimizationHistory.length > 50) {
      this.optimizationHistory = this.optimizationHistory.slice(-50);
    }
  }

  /**
   * Save infrastructure optimization report
   */
  async saveInfrastructureReport(report) {
    try {
      const reportsDir = 'reports/infrastructure-optimization';
      await fs.mkdir(reportsDir, { recursive: true });
      
      const reportFile = path.join(reportsDir, `infrastructure-optimization-${Date.now()}.json`);
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      
      logger.info(`Infrastructure optimization report saved: ${reportFile}`);
    } catch (error) {
      logger.error('Failed to save infrastructure report:', error);
    }
  }
}

// Export singleton instance
export const unifiedInfrastructureOptimizer = new UnifiedInfrastructureOptimizer();
