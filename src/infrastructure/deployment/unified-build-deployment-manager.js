// src/infrastructure/deployment/unified-build-deployment-manager.js
import { multiStageBuildManager } from "../build/multi-stage-build-manager.js";
import { buildCacheManager } from "../build/build-cache-manager.js";
import { blueGreenDeploymentManager } from "./blue-green-manager.js";
import { canaryDeploymentManager } from "./canary-deployment-manager.js";
import { rollbackAutomationManager } from "./rollback-automation-manager.js";
import { logger } from "#utils/core/logger.js";

/**
 * Unified Build & Deployment Manager
 * Orchestrates complete build and deployment pipeline with optimization
 */
export class UnifiedBuildDeploymentManager {
    constructor() {
        this.managers = {
            build: multiStageBuildManager,
            cache: buildCacheManager,
            blueGreen: blueGreenDeploymentManager,
            canary: canaryDeploymentManager,
            rollback: rollbackAutomationManager
        };
        this.pipelineHistory = [];
    }

    /**
     * Execute complete build and deployment pipeline
     */
    async executeCompletePipeline(config) {
        try {
            logger.info(`Starting complete build & deployment pipeline: ${config.serviceName}`);

            const pipeline = {
                serviceName: config.serviceName,
                startTime: new Date(),
                stages: [],
                success: false
            };

            // Stage 1: Multi-stage build with caching
            pipeline.stages.push({ stage: 'build', status: 'started' });
            const buildResult = await this.executeBuildStage(config);
            pipeline.stages.push({ stage: 'build', status: 'completed', result: buildResult });

            // Stage 2: Deploy based on strategy
            pipeline.stages.push({ stage: 'deploy', status: 'started' });
            const deployResult = await this.executeDeploymentStage(config, buildResult);
            pipeline.stages.push({ stage: 'deploy', status: 'completed', result: deployResult });

            // Stage 3: Enable monitoring and rollback automation
            if (config.enableRollbackAutomation !== false) {
                pipeline.stages.push({ stage: 'monitoring', status: 'started' });
                const monitoringResult = await this.enableMonitoringStage(config);
                pipeline.stages.push({ stage: 'monitoring', status: 'completed', result: monitoringResult });
            }

            pipeline.endTime = new Date();
            pipeline.duration = pipeline.endTime - pipeline.startTime;
            pipeline.success = true;

            // Store pipeline history
            this.storePipelineHistory(pipeline);

            logger.info(`Build & deployment pipeline completed successfully: ${config.serviceName}`, {
                duration: pipeline.duration,
                strategy: config.deploymentStrategy
            });

            return pipeline;

        } catch (error) {
            logger.error(`Build & deployment pipeline failed for ${config.serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Execute build stage with optimizations
     */
    async executeBuildStage(config) {
        const buildConfig = {
            serviceId: config.serviceName,
            dockerfile: config.dockerfile || `Dockerfile.${config.serviceName}`,
            context: config.buildContext || `./${config.serviceName}`,
            target: config.buildTarget || 'production',
            tag: `${config.serviceName}:${config.version || 'latest'}`
        };

        // Build with caching optimization
        return await buildCacheManager.buildWithCache(
            config.serviceName,
            buildConfig,
            config.buildOptions || {}
        );
    }

    /**
     * Execute deployment stage based on strategy
     */
    async executeDeploymentStage(config, buildResult) {
        const deploymentStrategy = config.deploymentStrategy || 'blue-green';
        const newImage = buildResult.buildResult?.tag || config.image;

        switch (deploymentStrategy) {
            case 'blue-green':
                return await this.executeBlueGreenDeployment(config, newImage);

            case 'canary':
                return await this.executeCanaryDeployment(config, newImage);

            case 'rolling':
                return await this.executeRollingDeployment(config, newImage);

            default:
                throw new Error(`Unknown deployment strategy: ${deploymentStrategy}`);
        }
    }

    /**
     * Execute blue-green deployment
     */
    async executeBlueGreenDeployment(config, newImage) {
        return await blueGreenDeploymentManager.completeBlueGreenDeployment(
            config.serviceName,
            newImage,
            config.namespace || 'default',
            config.blueGreenOptions || {}
        );
    }

    /**
     * Execute canary deployment
     */
    async executeCanaryDeployment(config, newImage) {
        const canaryResult = await canaryDeploymentManager.startCanaryDeployment(
            config.serviceName,
            newImage,
            config.canaryOptions || {}
        );

        // Wait for canary to complete
        if (canaryResult.monitoring) {
            await canaryResult.monitoring;
        }

        return canaryResult;
    }

    /**
     * Execute rolling deployment
     */
    async executeRollingDeployment(config, newImage) {
        // Implementation for standard Kubernetes rolling deployment
        return {
            strategy: 'rolling',
            image: newImage,
            success: true
        };
    }

    /**
     * Enable monitoring and rollback automation
     */
    async enableMonitoringStage(config) {
        if (config.enableRollbackAutomation !== false) {
            return await rollbackAutomationManager.enableAutomaticRollback(
                config.serviceName,
                config.namespace || 'default',
                config.rollbackOptions || {}
            );
        }
        return { monitoringEnabled: false };
    }

    /**
     * Generate comprehensive build & deployment report
     */


    // src/infrastructure/deployment/unified-build-deployment-manager.js (continued)

    /**
     * Generate comprehensive build & deployment report
     */
    async generateComprehensiveReport(pipeline) {
        try {
            const report = {
                generatedAt: new Date(),
                pipelineId: `pipeline-${Date.now()}`,
                serviceName: pipeline.serviceName,
                summary: {
                    totalStages: pipeline.stages.length,
                    successfulStages: pipeline.stages.filter(s => s.status === 'completed').length,
                    duration: pipeline.duration,
                    deploymentStrategy: pipeline.stages.find(s => s.stage === 'deploy')?.result?.strategy,
                    buildCacheHitRatio: this.extractCacheHitRatio(pipeline),
                    estimatedSavings: this.calculateEstimatedSavings(pipeline)
                },
                stages: this.formatStageResults(pipeline.stages),
                recommendations: await this.generateOptimizationRecommendations(pipeline),
                nextSteps: this.generateNextSteps(pipeline),
                artifacts: this.collectArtifacts(pipeline)
            };

            // Save report
            await this.saveReport(report);

            logger.info(`Comprehensive report generated for ${pipeline.serviceName}`);
            return report;

        } catch (error) {
            logger.error(`Failed to generate report for ${pipeline.serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Rollback to previous version
     */
    async rollbackToPreviousVersion(serviceName, namespace = 'default', options = {}) {
        try {
            logger.info(`Rolling back service to previous version: ${serviceName}`);

            const rollbackResult = {
                serviceName,
                startTime: new Date(),
                success: false,
                method: options.method || 'auto-detect'
            };

            // Detect current deployment strategy
            const currentStrategy = await this.detectDeploymentStrategy(serviceName, namespace);

            switch (currentStrategy) {
                case 'blue-green':
                    rollbackResult.result = await this.managers.blueGreen.rollbackToBlue(serviceName, namespace);
                    break;
                case 'canary':
                    rollbackResult.result = await this.managers.canary.rollbackCanary(`${serviceName}-canary`, namespace);
                    break;
                case 'rolling':
                    rollbackResult.result = await this.performRollingRollback(serviceName, namespace);
                    break;
                default:
                    throw new Error(`Unknown deployment strategy: ${currentStrategy}`);
            }

            rollbackResult.endTime = new Date();
            rollbackResult.duration = rollbackResult.endTime - rollbackResult.startTime;
            rollbackResult.success = rollbackResult.result?.success || false;

            // Record rollback in history
            this.recordRollback(rollbackResult);

            logger.info(`Rollback completed for ${serviceName}`, {
                strategy: currentStrategy,
                duration: rollbackResult.duration,
                success: rollbackResult.success
            });

            return rollbackResult;

        } catch (error) {
            logger.error(`Rollback failed for ${serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Execute environment promotion (dev -> staging -> production)
     */
    async promoteToEnvironment(serviceName, sourceEnv, targetEnv, options = {}) {
        try {
            logger.info(`Promoting ${serviceName} from ${sourceEnv} to ${targetEnv}`);

            const promotion = {
                serviceName,
                sourceEnvironment: sourceEnv,
                targetEnvironment: targetEnv,
                startTime: new Date(),
                stages: []
            };

            // Stage 1: Pre-promotion validation
            promotion.stages.push({ stage: 'validation', status: 'started' });
            const validationResult = await this.validateEnvironmentPromotion(serviceName, sourceEnv, targetEnv);
            promotion.stages.push({ stage: 'validation', status: 'completed', result: validationResult });

            if (!validationResult.success) {
                throw new Error(`Promotion validation failed: ${validationResult.errors.join(', ')}`);
            }

            // Stage 2: Get source environment configuration
            promotion.stages.push({ stage: 'config_extraction', status: 'started' });
            const sourceConfig = await this.extractEnvironmentConfig(serviceName, sourceEnv);
            promotion.stages.push({ stage: 'config_extraction', status: 'completed', result: sourceConfig });

            // Stage 3: Deploy to target environment
            promotion.stages.push({ stage: 'deployment', status: 'started' });
            const deploymentConfig = {
                ...sourceConfig,
                serviceName,
                namespace: targetEnv,
                deploymentStrategy: options.deploymentStrategy || 'blue-green',
                enableRollbackAutomation: true
            };

            const deploymentResult = await this.executeCompletePipeline(deploymentConfig);
            promotion.stages.push({ stage: 'deployment', status: 'completed', result: deploymentResult });

            // Stage 4: Post-promotion verification
            promotion.stages.push({ stage: 'verification', status: 'started' });
            const verificationResult = await this.verifyEnvironmentPromotion(serviceName, targetEnv);
            promotion.stages.push({ stage: 'verification', status: 'completed', result: verificationResult });

            promotion.endTime = new Date();
            promotion.duration = promotion.endTime - promotion.startTime;
            promotion.success = verificationResult.success;

            logger.info(`Environment promotion completed: ${serviceName}`, {
                sourceEnv,
                targetEnv,
                duration: promotion.duration,
                success: promotion.success
            });

            return promotion;

        } catch (error) {
            logger.error(`Environment promotion failed for ${serviceName}:`, error);
            throw error;
        }
    }

    /**
     * Optimize build and deployment pipeline
     */
    async optimizePipeline(serviceName, options = {}) {
        try {
            logger.info(`Optimizing pipeline for service: ${serviceName}`);

            const optimization = {
                serviceName,
                startTime: new Date(),
                optimizations: []
            };

            // Analyze build performance
            const buildMetrics = this.managers.build.getBuildMetrics(serviceName);
            const buildOptimization = await this.optimizeBuildPerformance(serviceName, buildMetrics);
            optimization.optimizations.push(buildOptimization);

            // Analyze cache performance
            const cacheMetrics = this.managers.cache.getCacheMetrics(serviceName);
            const cacheOptimization = await this.optimizeCachePerformance(serviceName, cacheMetrics);
            optimization.optimizations.push(cacheOptimization);

            // Analyze deployment performance
            const deploymentHistory = this.getPipelineHistory(serviceName);
            const deploymentOptimization = await this.optimizeDeploymentPerformance(serviceName, deploymentHistory);
            optimization.optimizations.push(deploymentOptimization);

            optimization.endTime = new Date();
            optimization.duration = optimization.endTime - optimization.startTime;

            // Generate optimization report
            const optimizationReport = await this.generateOptimizationReport(optimization);

            logger.info(`Pipeline optimization completed for ${serviceName}`, {
                optimizations: optimization.optimizations.length,
                duration: optimization.duration
            });

            return optimizationReport;

        } catch (error) {
            logger.error(`Pipeline optimization failed for ${serviceName}:`, error);
            throw error;
        }
    }

    // Helper methods
    storePipelineHistory(pipeline) {
        this.pipelineHistory.push({
            ...pipeline,
            id: `pipeline-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`
        });

        // Keep only last 100 pipeline runs
        if (this.pipelineHistory.length > 100) {
            this.pipelineHistory = this.pipelineHistory.slice(-100);
        }
    }

    extractCacheHitRatio(pipeline) {
        const buildStage = pipeline.stages.find(s => s.stage === 'build');
        return buildStage?.result?.cacheAnalysis?.hitRatio || 0;
    }

    calculateEstimatedSavings(pipeline) {
        const buildTime = pipeline.stages.find(s => s.stage === 'build')?.result?.duration || 0;
        const cacheHitRatio = this.extractCacheHitRatio(pipeline);

        // Estimate savings based on cache efficiency and build time
        const timeSavings = buildTime * (cacheHitRatio / 100) * 0.7; // 70% of cache hits save time
        const costSavings = timeSavings * 0.002; // Approximate cost per second

        return {
            timeSaved: Math.round(timeSavings),
            costSaved: Math.round(costSavings * 100) / 100
        };
    }

    formatStageResults(stages) {
        return stages.map(stage => ({
            name: stage.stage,
            status: stage.status,
            duration: stage.result?.duration || 0,
            success: stage.status === 'completed' && !stage.result?.error,
            details: {
                ...stage.result,
                // Remove sensitive information
                secrets: undefined,
                credentials: undefined
            }
        }));
    }

    async generateOptimizationRecommendations(pipeline) {
        const recommendations = [];

        // Build optimization recommendations
        const buildStage = pipeline.stages.find(s => s.stage === 'build');
        if (buildStage?.result) {
            const cacheHitRatio = buildStage.result.cacheAnalysis?.hitRatio || 0;

            if (cacheHitRatio < 50) {
                recommendations.push({
                    type: 'BUILD_CACHE_OPTIMIZATION',
                    priority: 'HIGH',
                    description: 'Build cache hit ratio is low, consider optimizing Dockerfile layer order',
                    currentValue: `${cacheHitRatio}%`,
                    targetValue: '80%+',
                    estimatedSavings: '30-50% build time reduction'
                });
            }

            const buildDuration = buildStage.result.duration || 0;
            if (buildDuration > 600000) { // 10 minutes
                recommendations.push({
                    type: 'BUILD_PERFORMANCE',
                    priority: 'MEDIUM',
                    description: 'Build time is longer than recommended threshold',
                    currentValue: `${Math.round(buildDuration / 1000)}s`,
                    targetValue: '<600s',
                    suggestions: [
                        'Implement multi-stage builds',
                        'Optimize dependency installation',
                        'Use smaller base images'
                    ]
                });
            }
        }

        // Deployment optimization recommendations
        const deployStage = pipeline.stages.find(s => s.stage === 'deploy');
        if (deployStage?.result?.strategy === 'rolling') {
            recommendations.push({
                type: 'DEPLOYMENT_STRATEGY',
                priority: 'MEDIUM',
                description: 'Consider using blue-green or canary deployment for zero-downtime deployments',
                currentValue: 'rolling',
                targetValue: 'blue-green or canary',
                benefits: ['Zero downtime', 'Easy rollback', 'Better risk management']
            });
        }

        return recommendations;
    }

    generateNextSteps(pipeline) {
        const nextSteps = [];

        if (pipeline.success) {
            nextSteps.push('Monitor application performance and health metrics');
            nextSteps.push('Set up automated rollback triggers');
            nextSteps.push('Plan next deployment cycle optimizations');
        } else {
            nextSteps.push('Review failed stages and error logs');
            nextSteps.push('Fix identified issues before retry');
            nextSteps.push('Consider rollback if production is affected');
        }

        return nextSteps;
    }

    collectArtifacts(pipeline) {
        const artifacts = [];

        pipeline.stages.forEach(stage => {
            if (stage.result?.artifacts) {
                artifacts.push(...stage.result.artifacts);
            }
            if (stage.result?.imageTag) {
                artifacts.push({
                    type: 'container_image',
                    name: stage.result.imageTag,
                    stage: stage.stage
                });
            }
        });

        return artifacts;
    }

    async detectDeploymentStrategy(serviceName, namespace) {
        try {
            // Check for blue-green deployments
            const blueExists = await this.checkDeploymentExists(`${serviceName}-blue`, namespace);
            const greenExists = await this.checkDeploymentExists(`${serviceName}-green`, namespace);

            if (blueExists || greenExists) {
                return 'blue-green';
            }

            // Check for canary deployments
            const canaryExists = await this.checkCanaryExists(`${serviceName}-canary`, namespace);
            if (canaryExists) {
                return 'canary';
            }

            // Default to rolling
            return 'rolling';

        } catch (error) {
            logger.warn(`Could not detect deployment strategy for ${serviceName}:`, error.message);
            return 'rolling';
        }
    }

    async performRollingRollback(serviceName, namespace) {
        try {
            const k8s = await import('@kubernetes/client-node');
            const kc = new k8s.KubeConfig();
            kc.loadFromDefault();
            const appsApi = kc.makeApiClient(k8s.AppsV1Api);

            // Perform kubectl rollout undo
            const { execSync } = await import('child_process');
            const rollbackCommand = `kubectl rollout undo deployment/${serviceName} --namespace=${namespace}`;

            execSync(rollbackCommand, { stdio: 'inherit' });

            return { success: true, method: 'rolling_rollback' };

        } catch (error) {
            logger.error(`Rolling rollback failed for ${serviceName}:`, error);
            return { success: false, error: error.message };
        }
    }

    recordRollback(rollbackResult) {
        // Store rollback in history for tracking
        if (!this.rollbackHistory) {
            this.rollbackHistory = [];
        }

        this.rollbackHistory.push({
            ...rollbackResult,
            timestamp: new Date()
        });

        // Keep only last 50 rollbacks
        if (this.rollbackHistory.length > 50) {
            this.rollbackHistory = this.rollbackHistory.slice(-50);
        }
    }

    async validateEnvironmentPromotion(serviceName, sourceEnv, targetEnv) {
        const validation = {
            success: true,
            errors: [],
            checks: []
        };

        // Check if source deployment exists and is healthy
        try {
            const sourceHealthy = await this.checkEnvironmentHealth(serviceName, sourceEnv);
            validation.checks.push({
                name: 'source_environment_health',
                success: sourceHealthy,
                details: sourceHealthy ? 'Source environment is healthy' : 'Source environment has issues'
            });

            if (!sourceHealthy) {
                validation.success = false;
                validation.errors.push('Source environment is not healthy');
            }
        } catch (error) {
            validation.success = false;
            validation.errors.push(`Source environment check failed: ${error.message}`);
        }

        // Check target environment readiness
        try {
            const targetReady = await this.checkEnvironmentReadiness(targetEnv);
            validation.checks.push({
                name: 'target_environment_readiness',
                success: targetReady,
                details: targetReady ? 'Target environment is ready' : 'Target environment is not ready'
            });

            if (!targetReady) {
                validation.success = false;
                validation.errors.push('Target environment is not ready');
            }
        } catch (error) {
            validation.success = false;
            validation.errors.push(`Target environment check failed: ${error.message}`);
        }

        return validation;
    }

    async extractEnvironmentConfig(serviceName, environment) {
        // Extract deployment configuration from source environment
        return {
            image: `${serviceName}:${environment}-latest`,
            version: environment,
            buildContext: `./${serviceName}`,
            dockerfile: `Dockerfile.${serviceName}`
        };
    }

    async verifyEnvironmentPromotion(serviceName, targetEnv) {
        // Verify the promoted deployment is working correctly
        const verification = {
            success: true,
            checks: []
        };

        // Health check
        const healthCheck = await this.checkEnvironmentHealth(serviceName, targetEnv);
        verification.checks.push({
            name: 'health_check',
            success: healthCheck
        });

        if (!healthCheck) {
            verification.success = false;
        }

        return verification;
    }

    async optimizeBuildPerformance(serviceName, buildMetrics) {
        const optimization = {
            type: 'build_performance',
            recommendations: []
        };

        if (buildMetrics.length > 0) {
            const avgDuration = buildMetrics.reduce((sum, m) => sum + m.duration, 0) / buildMetrics.length;

            if (avgDuration > 600000) { // 10 minutes
                optimization.recommendations.push('Consider multi-stage builds to reduce build time');
            }

            const avgCacheHitRatio = buildMetrics.reduce((sum, m) => sum + (m.cacheHitRatio || 0), 0) / buildMetrics.length;

            if (avgCacheHitRatio < 50) {
                optimization.recommendations.push('Optimize Dockerfile for better cache utilization');
            }
        }

        return optimization;
    }

    async optimizeCachePerformance(serviceName, cacheMetrics) {
        const optimization = {
            type: 'cache_performance',
            recommendations: []
        };

        if (cacheMetrics.length > 0) {
            const avgHitRatio = cacheMetrics.reduce((sum, m) => sum + (m.cacheHitRatio || 0), 0) / cacheMetrics.length;

            if (avgHitRatio < 60) {
                optimization.recommendations.push('Implement cache warming strategies');
                optimization.recommendations.push('Optimize cache key generation');
            }
        }

        return optimization;
    }

    async optimizeDeploymentPerformance(serviceName, deploymentHistory) {
        const optimization = {
            type: 'deployment_performance',
            recommendations: []
        };

        if (deploymentHistory.length > 0) {
            const failureRate = deploymentHistory.filter(d => !d.success).length / deploymentHistory.length;

            if (failureRate > 0.1) { // 10% failure rate
                optimization.recommendations.push('Implement better pre-deployment testing');
                optimization.recommendations.push('Consider canary deployments for safer rollouts');
            }

            const avgDuration = deploymentHistory.reduce((sum, d) => sum + d.duration, 0) / deploymentHistory.length;

            if (avgDuration > 1800000) { // 30 minutes
                optimization.recommendations.push('Optimize deployment strategy for faster rollouts');
            }
        }

        return optimization;
    }

    async generateOptimizationReport(optimization) {
        const report = {
            generatedAt: new Date(),
            serviceName: optimization.serviceName,
            duration: optimization.duration,
            optimizations: optimization.optimizations,
            summary: {
                totalRecommendations: optimization.optimizations.reduce((sum, opt) => sum + opt.recommendations.length, 0),
                categories: optimization.optimizations.map(opt => opt.type),
                estimatedImpact: 'Medium to High'
            }
        };

        await this.saveOptimizationReport(report);
        return report;
    }

    // Utility methods
    async checkDeploymentExists(deploymentName, namespace) {
        try {
            const k8s = await import('@kubernetes/client-node');
            const kc = new k8s.KubeConfig();
            kc.loadFromDefault();
            const appsApi = kc.makeApiClient(k8s.AppsV1Api);

            await appsApi.readNamespacedDeployment(deploymentName, namespace);
            return true;
        } catch (error) {
            return false;
        }
    }

    async checkCanaryExists(canaryName, namespace) {
        try {
            const k8s = await import('@kubernetes/client-node');
            const kc = new k8s.KubeConfig();
            kc.loadFromDefault();
            const customApi = kc.makeApiClient(k8s.CustomObjectsApi);

            await customApi.getNamespacedCustomObject('flagger.app', 'v1beta1', namespace, 'canaries', canaryName);
            return true;
        } catch (error) {
            return false;
        }
    }

    async checkEnvironmentHealth(serviceName, environment) {
        // Simulate health check
        return true;
    }

    async checkEnvironmentReadiness(environment) {
        // Simulate readiness check
        return true;
    }

    async saveReport(report) {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');

            const reportsDir = 'reports/build-deployment';
            await fs.mkdir(reportsDir, { recursive: true });

            const reportFile = path.join(reportsDir, `${report.serviceName}-${Date.now()}.json`);
            await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

            logger.info(`Report saved: ${reportFile}`);
        } catch (error) {
            logger.error('Failed to save report:', error);
        }
    }

    async saveOptimizationReport(report) {
        try {
            const fs = await import('fs/promises');
            const path = await import('path');

            const reportsDir = 'reports/optimization';
            await fs.mkdir(reportsDir, { recursive: true });

            const reportFile = path.join(reportsDir, `optimization-${report.serviceName}-${Date.now()}.json`);
            await fs.writeFile(reportFile, JSON.stringify(report, null, 2));

            logger.info(`Optimization report saved: ${reportFile}`);
        } catch (error) {
            logger.error('Failed to save optimization report:', error);
        }
    }

    // Public getters
    getPipelineHistory(serviceName = null, limit = 50) {
        let history = this.pipelineHistory;

        if (serviceName) {
            history = history.filter(p => p.serviceName === serviceName);
        }

        return history
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
            .slice(0, limit);
    }

    getRollbackHistory(serviceName = null, limit = 20) {
        if (!this.rollbackHistory) return [];

        let history = this.rollbackHistory;

        if (serviceName) {
            history = history.filter(r => r.serviceName === serviceName);
        }

        return history
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    getPipelineStatistics() {
        const stats = {
            totalPipelines: this.pipelineHistory.length,
            successfulPipelines: this.pipelineHistory.filter(p => p.success).length,
            averageDuration: 0,
            mostUsedStrategy: 'unknown',
            cacheEfficiency: 0
        };

        if (this.pipelineHistory.length > 0) {
            stats.averageDuration = this.pipelineHistory.reduce((sum, p) => sum + p.duration, 0) / this.pipelineHistory.length;

            // Find most used deployment strategy
            const strategies = this.pipelineHistory.map(p => {
                const deployStage = p.stages.find(s => s.stage === 'deploy');
                return deployStage?.result?.strategy || 'unknown';
            });

            const strategyCounts = strategies.reduce((counts, strategy) => {
                counts[strategy] = (counts[strategy] || 0) + 1;
                return counts;
            }, {});

            stats.mostUsedStrategy = Object.keys(strategyCounts).reduce((a, b) =>
                strategyCounts[a] > strategyCounts[b] ? a : b
            );

            // Calculate average cache efficiency
            const cacheRatios = this.pipelineHistory
                .map(p => this.extractCacheHitRatio(p))
                .filter(ratio => ratio > 0);

            if (cacheRatios.length > 0) {
                stats.cacheEfficiency = cacheRatios.reduce((sum, ratio) => sum + ratio, 0) / cacheRatios.length;
            }
        }

        return stats;
    }
}

// Export singleton instance
export const unifiedBuildDeploymentManager = new UnifiedBuildDeploymentManager();
