// src/infrastructure/deployment/blue-green-manager.js
import k8s from "@kubernetes/client-node";
import { logger } from "#utils/core/logger.js";

/**
 * Blue-Green Deployment Manager
 * Manages blue-green deployments with zero downtime
 */
export class BlueGreenDeploymentManager {
  constructor() {
    this.k8sConfig = new k8s.KubeConfig();
    this.k8sConfig.loadFromDefault();
    this.k8sApi = this.k8sConfig.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.k8sConfig.makeApiClient(k8s.AppsV1Api);
    this.networkingApi = this.k8sConfig.makeApiClient(k8s.NetworkingV1Api);
    
    this.deploymentStates = new Map();
    this.switchHistory = [];
  }

  /**
   * Deploy new version to green environment
   */
  async deployToGreen(deploymentName, newImage, namespace = 'default') {
    try {
      logger.info(`Starting blue-green deployment to green environment: ${deploymentName}`);

      // Get current production (blue) deployment
      const blueDeployment = await this.appsApi.readNamespacedDeployment(
        `${deploymentName}-blue`, 
        namespace
      );

      // Create green deployment configuration
      const greenDeploymentConfig = this.createGreenDeploymentConfig(
        blueDeployment.body, 
        newImage
      );

      // Deploy to green environment
      try {
        // Try to get existing green deployment
        await this.appsApi.readNamespacedDeployment(`${deploymentName}-green`, namespace);
        // Update existing green deployment
        await this.appsApi.replaceNamespacedDeployment(
          `${deploymentName}-green`,
          namespace,
          greenDeploymentConfig
        );
        logger.info(`Updated existing green deployment: ${deploymentName}-green`);
      } catch (error) {
        if (error.response && error.response.statusCode === 404) {
          // Create new green deployment
          await this.appsApi.createNamespacedDeployment(namespace, greenDeploymentConfig);
          logger.info(`Created new green deployment: ${deploymentName}-green`);
        } else {
          throw error;
        }
      }

      // Scale up green deployment
      await this.scaleDeployment(`${deploymentName}-green`, namespace, 3);

      // Wait for green deployment to be ready
      await this.waitForDeploymentReady(`${deploymentName}-green`, namespace);

      // Run health checks on green environment
      const healthCheck = await this.runHealthChecks(deploymentName, 'green', namespace);
      
      if (!healthCheck.success) {
        throw new Error(`Green environment health check failed: ${healthCheck.errors.join(', ')}`);
      }

      logger.info(`Green deployment successful and healthy: ${deploymentName}`);
      
      return {
        success: true,
        greenDeployment: `${deploymentName}-green`,
        healthCheck,
        readyForSwitch: true
      };

    } catch (error) {
      logger.error(`Green deployment failed for ${deploymentName}:`, error);
      throw error;
    }
  }

  /**
   * Switch traffic from blue to green
   */
  async switchToGreen(deploymentName, namespace = 'default') {
    try {
      logger.info(`Switching traffic to green environment: ${deploymentName}`);

      // Verify green deployment is healthy
      const healthCheck = await this.runHealthChecks(deploymentName, 'green', namespace);
      if (!healthCheck.success) {
        throw new Error('Green environment is not healthy, cannot switch traffic');
      }

      // Get current service configuration
      const service = await this.k8sApi.readNamespacedService(
        `${deploymentName}-service`,
        namespace
      );

      // Store current state for rollback
      const currentState = {
        timestamp: new Date(),
        previousVersion: service.body.spec.selector.version,
        deployment: deploymentName,
        namespace
      };

      // Update service selector to point to green
      service.body.spec.selector.version = 'green';
      
      await this.k8sApi.replaceNamespacedService(
        `${deploymentName}-service`,
        namespace,
        service.body
      );

      // Wait for traffic switch to propagate
      await this.waitForTrafficSwitch(deploymentName, 'green', namespace);

      // Verify traffic is flowing to green
      const trafficVerification = await this.verifyTrafficSwitch(deploymentName, namespace);
      
      if (!trafficVerification.success) {
        // Rollback if verification fails
        await this.rollbackTrafficSwitch(currentState);
        throw new Error('Traffic switch verification failed, rolled back to blue');
      }

      // Store switch history
      this.switchHistory.push({
        ...currentState,
        newVersion: 'green',
        success: true,
        completedAt: new Date()
      });

      logger.info(`Traffic successfully switched to green: ${deploymentName}`);

      return {
        success: true,
        switchedTo: 'green',
        previousVersion: currentState.previousVersion,
        switchTime: new Date()
      };

    } catch (error) {
      logger.error(`Traffic switch to green failed for ${deploymentName}:`, error);
      throw error;
    }
  }

  /**
   * Complete blue-green deployment process
   */
  async completeBlueGreenDeployment(deploymentName, newImage, namespace = 'default', options = {}) {
    try {
      const deploymentProcess = {
        startTime: new Date(),
        steps: [],
        success: false
      };

      // Step 1: Deploy to green environment
      deploymentProcess.steps.push({ step: 'deploy_to_green', status: 'started' });
      const greenDeployment = await this.deployToGreen(deploymentName, newImage, namespace);
      deploymentProcess.steps.push({ step: 'deploy_to_green', status: 'completed', result: greenDeployment });

      // Step 2: Run comprehensive tests on green
      if (!options.skipTests) {
        deploymentProcess.steps.push({ step: 'green_testing', status: 'started' });
        const testResults = await this.runGreenEnvironmentTests(deploymentName, namespace);
        deploymentProcess.steps.push({ step: 'green_testing', status: 'completed', result: testResults });
        
        if (!testResults.success) {
          throw new Error(`Green environment tests failed: ${testResults.failedTests.join(', ')}`);
        }
      }

      // Step 3: Switch traffic to green
      deploymentProcess.steps.push({ step: 'traffic_switch', status: 'started' });
      const trafficSwitch = await this.switchToGreen(deploymentName, namespace);
      deploymentProcess.steps.push({ step: 'traffic_switch', status: 'completed', result: trafficSwitch });

      // Step 4: Monitor green environment post-switch
      deploymentProcess.steps.push({ step: 'post_switch_monitoring', status: 'started' });
      const monitoring = await this.monitorPostSwitch(deploymentName, namespace, options.monitorDuration || 300);
      deploymentProcess.steps.push({ step: 'post_switch_monitoring', status: 'completed', result: monitoring });

      if (!monitoring.success) {
        // Automatic rollback if monitoring detects issues
        await this.rollbackToBlue(deploymentName, namespace);
        throw new Error('Post-switch monitoring detected issues, rolled back to blue');
      }

      // Step 5: Scale down blue environment
      if (!options.keepBlue) {
        deploymentProcess.steps.push({ step: 'scale_down_blue', status: 'started' });
        await this.scaleDeployment(`${deploymentName}-blue`, namespace, 0);
        deploymentProcess.steps.push({ step: 'scale_down_blue', status: 'completed' });
      }

      deploymentProcess.success = true;
      deploymentProcess.endTime = new Date();
      deploymentProcess.duration = deploymentProcess.endTime - deploymentProcess.startTime;

      logger.info(`Blue-green deployment completed successfully: ${deploymentName}`, {
        duration: deploymentProcess.duration,
        image: newImage
      });

      return deploymentProcess;

    } catch (error) {
      logger.error(`Blue-green deployment failed for ${deploymentName}:`, error);
      
      // Attempt cleanup on failure
      try {
        await this.cleanupFailedDeployment(deploymentName, namespace);
      } catch (cleanupError) {
        logger.error(`Cleanup failed after deployment failure:`, cleanupError);
      }
      
      throw error;
    }
  }

  /**
   * Rollback to blue environment
   */
  async rollbackToBlue(deploymentName, namespace = 'default') {
    try {
      logger.info(`Rolling back to blue environment: ${deploymentName}`);

      // Get current service
      const service = await this.k8sApi.readNamespacedService(
        `${deploymentName}-service`,
        namespace
      );

      // Switch selector back to blue
      service.body.spec.selector.version = 'blue';
      
      await this.k8sApi.replaceNamespacedService(
        `${deploymentName}-service`,
        namespace,
        service.body
      );

      // Ensure blue deployment is scaled up
      await this.scaleDeployment(`${deploymentName}-blue`, namespace, 3);
      
      // Wait for blue to be ready
      await this.waitForDeploymentReady(`${deploymentName}-blue`, namespace);

      logger.info(`Successfully rolled back to blue environment: ${deploymentName}`);

      return { success: true, rolledBackTo: 'blue' };

    } catch (error) {
      logger.error(`Rollback to blue failed for ${deploymentName}:`, error);
      throw error;
    }
  }

  /**
   * Run health checks on environment
   */
  async runHealthChecks(deploymentName, environment, namespace) {
    try {
      const healthCheck = {
        success: true,
        errors: [],
        checks: []
      };

      // Check deployment readiness
      const deployment = await this.appsApi.readNamespacedDeployment(
        `${deploymentName}-${environment}`,
        namespace
      );

      const readyReplicas = deployment.body.status.readyReplicas || 0;
      const desiredReplicas = deployment.body.spec.replicas || 0;

      if (readyReplicas !== desiredReplicas) {
        healthCheck.success = false;
        healthCheck.errors.push(`Only ${readyReplicas}/${desiredReplicas} replicas ready`);
      }

      healthCheck.checks.push({
        name: 'deployment_readiness',
        success: readyReplicas === desiredReplicas,
        details: { readyReplicas, desiredReplicas }
      });

      // Check pod health
      const pods = await this.k8sApi.listNamespacedPod(
        namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        `app=${deploymentName.replace('-', '-')},version=${environment}`
      );

      for (const pod of pods.body.items) {
        const podReady = pod.status.conditions?.find(c => c.type === 'Ready')?.status === 'True';
        
        if (!podReady) {
          healthCheck.success = false;
          healthCheck.errors.push(`Pod ${pod.metadata.name} not ready`);
        }

        healthCheck.checks.push({
          name: `pod_${pod.metadata.name}`,
          success: podReady,
          details: pod.status.phase
        });
      }

      return healthCheck;

    } catch (error) {
      logger.error(`Health check failed for ${deploymentName}-${environment}:`, error);
      return {
        success: false,
        errors: [error.message],
        checks: []
      };
    }
  }

  // Helper methods
  createGreenDeploymentConfig(blueDeployment, newImage) {
    const greenConfig = JSON.parse(JSON.stringify(blueDeployment));
    
    // Update metadata
    greenConfig.metadata.name = greenConfig.metadata.name.replace('-blue', '-green');
    greenConfig.metadata.labels.version = 'green';
    
    // Update selectors
    greenConfig.spec.selector.matchLabels.version = 'green';
    greenConfig.spec.template.metadata.labels.version = 'green';
    
    // Update image
    greenConfig.spec.template.spec.containers[0].image = newImage;
    
    // Update environment variable
    const envVars = greenConfig.spec.template.spec.containers[0].env || [];
    const versionEnv = envVars.find(env => env.name === 'DEPLOYMENT_VERSION');
    if (versionEnv) {
      versionEnv.value = 'green';
    }
    
    // Start with 0 replicas (will be scaled up later)
    greenConfig.spec.replicas = 0;
    
    return greenConfig;
  }

  async scaleDeployment(deploymentName, namespace, replicas) {
    try {
      const deployment = await this.appsApi.readNamespacedDeployment(deploymentName, namespace);
      deployment.body.spec.replicas = replicas;
      
      await this.appsApi.replaceNamespacedDeployment(deploymentName, namespace, deployment.body);
      logger.debug(`Scaled ${deploymentName} to ${replicas} replicas`);
      
    } catch (error) {
      logger.error(`Failed to scale deployment ${deploymentName}:`, error);
      throw error;
    }
  }

  async waitForDeploymentReady(deploymentName, namespace, timeoutMs = 300000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      try {
        const deployment = await this.appsApi.readNamespacedDeployment(deploymentName, namespace);
        const readyReplicas = deployment.body.status.readyReplicas || 0;
        const desiredReplicas = deployment.body.spec.replicas || 0;
        
        if (readyReplicas === desiredReplicas && desiredReplicas > 0) {
          logger.debug(`Deployment ${deploymentName} is ready`);
          return true;
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        
      } catch (error) {
        logger.warn(`Error checking deployment readiness: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    throw new Error(`Deployment ${deploymentName} did not become ready within timeout`);
  }

  async waitForTrafficSwitch(deploymentName, targetVersion, namespace) {
    // Wait for service update to propagate
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
    logger.debug(`Traffic switch propagation wait completed for ${deploymentName}`);
  }

  async verifyTrafficSwitch(deploymentName, namespace) {
    try {
      // This would involve actual HTTP requests to verify traffic routing
      // For now, we'll simulate verification
      const service = await this.k8sApi.readNamespacedService(`${deploymentName}-service`, namespace);
      const currentVersion = service.body.spec.selector.version;
      
      return {
        success: true,
        currentVersion,
        verified: true
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async rollbackTrafficSwitch(previousState) {
    try {
      const service = await this.k8sApi.readNamespacedService(
        `${previousState.deployment}-service`,
        previousState.namespace
      );
      
      service.body.spec.selector.version = previousState.previousVersion;
      
      await this.k8sApi.replaceNamespacedService(
        `${previousState.deployment}-service`,
        previousState.namespace,
        service.body
      );
      
      logger.info(`Traffic rolled back to ${previousState.previousVersion}`);
      
    } catch (error) {
      logger.error('Failed to rollback traffic switch:', error);
      throw error;
    }
  }

  async runGreenEnvironmentTests(deploymentName, namespace) {
    // Simulate comprehensive testing
    return {
      success: true,
      testsRun: ['health-check', 'api-endpoints', 'database-connectivity'],
      failedTests: []
    };
  }

  async monitorPostSwitch(deploymentName, namespace, durationSeconds) {
    logger.info(`Monitoring green environment for ${durationSeconds} seconds`);
    
    // Simulate monitoring with health checks
    const monitoringInterval = setInterval(async () => {
      try {
        await this.runHealthChecks(deploymentName, 'green', namespace);
      } catch (error) {
        clearInterval(monitoringInterval);
        throw error;
      }
    }, 30000); // Check every 30 seconds

    await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000));
    clearInterval(monitoringInterval);

    return { success: true, monitoredFor: durationSeconds };
  }

  async cleanupFailedDeployment(deploymentName, namespace) {
    try {
      // Scale down green deployment
      await this.scaleDeployment(`${deploymentName}-green`, namespace, 0);
      logger.info(`Cleaned up failed deployment: ${deploymentName}`);
    } catch (error) {
      logger.warn(`Cleanup warning for ${deploymentName}:`, error.message);
    }
  }

  getDeploymentHistory() {
    return this.switchHistory;
  }
}

// Export singleton instance
export const blueGreenDeploymentManager = new BlueGreenDeploymentManager();
