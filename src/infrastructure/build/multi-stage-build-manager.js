// src/infrastructure/build/multi-stage-build-manager.js
import { logger } from "#utils/core/logger.js";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";

/**
 * Multi-stage Build Manager
 * Manages optimized Docker builds with multiple stages
 */
export class MultiStageBuildManager {
  constructor() {
    this.buildConfigurations = new Map();
    this.buildCache = new Map();
    this.buildMetrics = new Map();
    this.initializeBuildConfigurations();
  }

  /**
   * Initialize build configurations for different services
   */
  initializeBuildConfigurations() {
    // API Server build configuration
    this.addBuildConfiguration('api-server', {
      dockerfile: 'Dockerfile.api',
      context: './api',
      target: 'production',
      stages: {
        base: 'Common dependencies and runtime setup',
        build: 'Build application and run tests',
        security: 'Security scanning and vulnerability checks',
        production: 'Final production image',
        development: 'Development environment with hot reload'
      },
      buildArgs: {
        NODE_ENV: 'production',
        BUILD_VERSION: process.env.BUILD_VERSION || 'latest'
      },
      labels: {
        'maintainer': 'School ERP Team',
        'service': 'api-server',
        'tier': 'backend'
      }
    });

    // Frontend build configuration
    this.addBuildConfiguration('frontend', {
      dockerfile: 'Dockerfile.frontend',
      context: './frontend',
      target: 'production',
      stages: {
        builder: 'Node.js build environment',
        analyzer: 'Bundle analysis for optimization',
        production: 'NGINX production server',
        development: 'Development server with hot reload'
      },
      buildArgs: {
        REACT_APP_API_URL: process.env.API_URL,
        REACT_APP_VERSION: process.env.BUILD_VERSION
      }
    });

    // Database migration configuration
    this.addBuildConfiguration('db-migration', {
      dockerfile: 'Dockerfile.database-migration',
      context: './database',
      target: 'migration-runner',
      stages: {
        'migration-base': 'Base image with database tools',
        'migration-build': 'Migration scripts validation',
        'migration-runner': 'Production migration execution',
        'rollback-runner': 'Rollback execution environment'
      }
    });
  }

  /**
   * Build image with optimized multi-stage process
   */
  async buildImage(serviceId, options = {}) {
    try {
      const config = this.buildConfigurations.get(serviceId);
      if (!config) {
        throw new Error(`Build configuration not found for service: ${serviceId}`);
      }

      logger.info(`Starting multi-stage build for service: ${serviceId}`);
      const startTime = Date.now();

      const buildOptions = {
        target: options.target || config.target,
        tag: options.tag || `${serviceId}:${process.env.BUILD_VERSION || 'latest'}`,
        cache: options.useCache !== false,
        platform: options.platform || 'linux/amd64',
        ...options
      };

      // Build command with BuildKit optimizations
      const buildCommand = this.constructBuildCommand(config, buildOptions);
      
      // Execute build with progress monitoring
      const buildResult = await this.executeBuildWithProgress(buildCommand, serviceId);
      
      const duration = Date.now() - startTime;
      
      // Store build metrics
      this.storeBuildMetrics(serviceId, {
        duration,
        imageSize: buildResult.imageSize,
        layers: buildResult.layers,
        cacheHits: buildResult.cacheHits,
        buildOptions
      });

      logger.info(`Multi-stage build completed for ${serviceId}`, {
        duration: `${duration}ms`,
        imageSize: buildResult.imageSize,
        target: buildOptions.target
      });

      return buildResult;

    } catch (error) {
      logger.error(`Multi-stage build failed for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Build all stages for analysis and optimization
   */
  async buildAllStages(serviceId, options = {}) {
    try {
      const config = this.buildConfigurations.get(serviceId);
      const results = {};

      for (const [stageName, description] of Object.entries(config.stages)) {
        logger.info(`Building stage: ${stageName} - ${description}`);
        
        const stageResult = await this.buildImage(serviceId, {
          ...options,
          target: stageName,
          tag: `${serviceId}:${stageName}-${Date.now()}`
        });
        
        results[stageName] = stageResult;
      }

      return results;

    } catch (error) {
      logger.error(`Failed to build all stages for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Optimize build for different environments
   */
  async optimizeForEnvironment(serviceId, environment) {
    const optimizations = {
      development: {
        target: 'development',
        buildArgs: {
          NODE_ENV: 'development'
        },
        cache: true,
        skipTests: false
      },
      staging: {
        target: 'production',
        buildArgs: {
          NODE_ENV: 'staging'
        },
        cache: true,
        skipTests: false,
        securityScan: true
      },
      production: {
        target: 'production',
        buildArgs: {
          NODE_ENV: 'production'
        },
        cache: false, // Fresh build for production
        skipTests: false,
        securityScan: true,
        multiPlatform: true
      }
    };

    const envOptimization = optimizations[environment];
    if (!envOptimization) {
      throw new Error(`Unknown environment: ${environment}`);
    }

    return await this.buildImage(serviceId, envOptimization);
  }

  // Helper methods
  addBuildConfiguration(serviceId, config) {
    this.buildConfigurations.set(serviceId, config);
    logger.debug(`Build configuration added for service: ${serviceId}`);
  }

  constructBuildCommand(config, options) {
    let command = [
      'docker', 'buildx', 'build',
      '--file', config.dockerfile,
      '--target', options.target,
      '--tag', options.tag
    ];

    // Add build arguments
    if (config.buildArgs) {
      for (const [key, value] of Object.entries(config.buildArgs)) {
        command.push('--build-arg', `${key}=${value}`);
      }
    }

    // Add labels
    if (config.labels) {
      for (const [key, value] of Object.entries(config.labels)) {
        command.push('--label', `${key}=${value}`);
      }
    }

    // Cache optimization
    if (options.cache) {
      command.push(
        '--cache-from', `type=registry,ref=${options.tag}-cache`,
        '--cache-to', `type=registry,ref=${options.tag}-cache,mode=max`
      );
    }

    // Platform specification
    if (options.platform) {
      command.push('--platform', options.platform);
    }

    // BuildKit features
    command.push('--progress=plain');
    command.push(config.context);

    return command.join(' ');
  }

  async executeBuildWithProgress(buildCommand, serviceId) {
    return new Promise((resolve, reject) => {
      try {
        const result = execSync(buildCommand, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        });

        // Parse build output for metrics
        const metrics = this.parseBuildOutput(result);
        
        resolve({
          success: true,
          output: result,
          ...metrics
        });

      } catch (error) {
        logger.error(`Build execution failed for ${serviceId}:`, error.message);
        reject(error);
      }
    });
  }

  parseBuildOutput(output) {
    // Extract metrics from Docker build output
    const lines = output.split('\n');
    let imageSize = 0;
    let layers = 0;
    let cacheHits = 0;

    for (const line of lines) {
      if (line.includes('CACHED')) {
        cacheHits++;
      }
      if (line.includes('sha256:')) {
        layers++;
      }
      // Extract final image size if available
      const sizeMatch = line.match(/size:\s*(\d+(?:\.\d+)?)\s*([KMGT]?B)/i);
      if (sizeMatch) {
        imageSize = this.convertSizeToBytes(sizeMatch[1], sizeMatch[2]);
      }
    }

    return { imageSize, layers, cacheHits };
  }

  convertSizeToBytes(size, unit) {
    const multipliers = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };

    return parseFloat(size) * (multipliers[unit.toUpperCase()] || 1);
  }

  storeBuildMetrics(serviceId, metrics) {
    if (!this.buildMetrics.has(serviceId)) {
      this.buildMetrics.set(serviceId, []);
    }
    
    const serviceMetrics = this.buildMetrics.get(serviceId);
    serviceMetrics.push({
      timestamp: new Date(),
      ...metrics
    });

    // Keep only last 50 builds
    if (serviceMetrics.length > 50) {
      serviceMetrics.splice(0, serviceMetrics.length - 50);
    }
  }

  getBuildMetrics(serviceId) {
    return this.buildMetrics.get(serviceId) || [];
  }
}

// Export singleton instance
export const multiStageBuildManager = new MultiStageBuildManager();
