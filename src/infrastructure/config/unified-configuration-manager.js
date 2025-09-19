// src/infrastructure/config/unified-configuration-manager.js
import { advancedConfigManager } from "./advanced-config-manager.js";
import { environmentConfigValidator } from "./environment-config-validator.js";
import { secretRotationManager } from "../security/secret-rotation-manager.js";
import { configurationDriftDetector } from "./configuration-drift-detector.js";
import { logger } from "#utils/core/logger.js";

/**
 * Unified Configuration Management System
 * Orchestrates all configuration management components
 */
export class UnifiedConfigurationManager {
  constructor() {
    this.managers = {
      config: advancedConfigManager,
      validator: environmentConfigValidator,
      secrets: secretRotationManager,
      drift: configurationDriftDetector
    };
    this.initialized = false;
  }

  /**
   * Initialize unified configuration management
   */
  async initializeConfigurationManagement(options = {}) {
    try {
      logger.info('Initializing unified configuration management system');

      const results = {
        startTime: new Date(),
        initialized: [],
        failed: []
      };

      // Initialize configuration manager
      try {
        // Load default configurations
        if (options.loadDefaults !== false) {
          await this.loadDefaultConfigurations();
        }
        results.initialized.push('configuration_manager');
      } catch (error) {
        results.failed.push({ component: 'configuration_manager', error: error.message });
      }

      // Initialize secret rotation
      if (options.enableSecretRotation !== false) {
        try {
          // Register default secrets for rotation
          await this.registerDefaultSecrets();
          results.initialized.push('secret_rotation');
        } catch (error) {
          results.failed.push({ component: 'secret_rotation', error: error.message });
        }
      }

      // Initialize drift detection
      if (options.enableDriftDetection !== false) {
        try {
          // Create initial baseline
          await this.managers.drift.createBaseline('initial_deployment', options.configPaths || []);
          results.initialized.push('drift_detection');
        } catch (error) {
          results.failed.push({ component: 'drift_detection', error: error.message });
        }
      }

      // Setup cross-component integration
      this.setupComponentIntegration();
      results.initialized.push('component_integration');

      this.initialized = true;
      results.endTime = new Date();
      results.duration = results.endTime - results.startTime;

      logger.info('Unified configuration management initialized', {
        initialized: results.initialized.length,
        failed: results.failed.length,
        duration: results.duration
      });

      return results;

    } catch (error) {
      logger.error('Failed to initialize unified configuration management:', error);
      throw error;
    }
  }

  /**
   * Load default configurations for all environments
   */
  async loadDefaultConfigurations() {
    const environments = ['development', 'staging', 'production'];
    const configTypes = ['database', 'redis', 'api', 'aws'];

    for (const env of environments) {
      for (const configType of configTypes) {
        try {
          await this.managers.config.loadConfiguration(configType, env);
        } catch (error) {
          logger.warn(`Failed to load ${configType} config for ${env}:`, error.message);
        }
      }
    }
  }

  /**
   * Register default secrets for rotation
   */
  async registerDefaultSecrets() {
    const secrets = [
      {
        secretId: 'database-credentials',
        policyId: 'database-credentials'
      },
      {
        secretId: 'jwt-signing-secret',
        policyId: 'jwt-signing-secret'
      },
      {
        secretId: 'external-api-keys',
        policyId: 'external-api-keys'
      }
    ];

    for (const secret of secrets) {
      try {
        await this.managers.secrets.registerSecret(secret);
      } catch (error) {
        logger.warn(`Failed to register secret ${secret.secretId}:`, error.message);
      }
    }
  }

  /**
   * Setup integration between components
   */
  setupComponentIntegration() {
    // Listen to configuration changes
    this.managers.config.on('configurationSaved', async (event) => {
      // Validate configuration after save
      try {
        await this.managers.validator.validateEnvironmentConfig(
          event.configName,
          event.config,
          event.environment
        );
      } catch (error) {
        logger.error('Configuration validation failed after save:', error);
      }

      // Trigger drift scan
      setTimeout(async () => {
        try {
          await this.managers.drift.scanForDrift();
        } catch (error) {
          logger.error('Drift scan failed after configuration change:', error);
        }
      }, 5000);
    });

    // Listen to drift detection
    this.managers.drift.on('driftDetected', async (driftScan) => {
      logger.warn('Configuration drift detected', {
        scanId: driftScan.scanId,
        driftedConfigs: driftScan.driftedConfigs,
        criticalDrifts: driftScan.summary.critical
      });

      // Auto-remediate if configured
      if (driftScan.summary.critical > 0) {
        // Alert administrators
        logger.error('Critical configuration drift detected - manual intervention required');
      }
    });

    // Listen to secret rotation events
    this.managers.secrets.on('secretRotated', async (rotationResult) => {
      logger.info('Secret rotated successfully', {
        secretId: rotationResult.secretId,
        newVersion: rotationResult.newSecretVersion
      });
    });

    logger.info('Component integration setup completed');
  }

  /**
   * Generate comprehensive configuration report
   */
  async generateComprehensiveConfigReport() {
    try {
      logger.info('Generating comprehensive configuration report');

      const report = {
        generatedAt: new Date(),
        components: {},
        summary: {
          totalConfigurations: 0,
          validConfigurations: 0,
          driftDetected: false,
          secretsRotated: 0,
          overallHealth: 'UNKNOWN'
        },
        recommendations: []
      };

      // Configuration manager report
      try {
        const configReport = await this.managers.config.generateConfigurationReport();
        report.components.configuration = {
          status: 'SUCCESS',
          data: configReport
        };
        report.summary.totalConfigurations += configReport.totalConfigurations;
      } catch (error) {
        report.components.configuration = {
          status: 'ERROR',
          error: error.message
        };
      }

      // Validation report
      try {
        const validationReport = this.managers.validator.getValidationReport();
        report.components.validation = {
          status: 'SUCCESS',
          data: validationReport
        };
        report.summary.validConfigurations = validationReport.totalValidations;
      } catch (error) {
        report.components.validation = {
          status: 'ERROR',
          error: error.message
        };
      }

      // Secret rotation report
      try {
        const secretReport = await this.managers.secrets.generateRotationReport();
        report.components.secrets = {
          status: 'SUCCESS',
          data: secretReport
        };
        report.summary.secretsRotated = secretReport.recentRotations.length;
      } catch (error) {
        report.components.secrets = {
          status: 'ERROR',
          error: error.message
        };
      }

      // Drift detection report
      try {
        const driftReport = await this.managers.drift.generateDriftReport();
        report.components.drift = {
          status: 'SUCCESS',
          data: driftReport
        };
        report.summary.driftDetected = driftReport.summary.driftDetected > 0;
      } catch (error) {
        report.components.drift = {
          status: 'ERROR',
          error: error.message
        };
      }

      // Calculate overall health
      report.summary.overallHealth = this.calculateOverallHealth(report);

      // Generate recommendations
      report.recommendations = this.generateConfigurationRecommendations(report);

      logger.info('Comprehensive configuration report generated', {
        overallHealth: report.summary.overallHealth,
        components: Object.keys(report.components).length,
        recommendations: report.recommendations.length
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate comprehensive configuration report:', error);
      throw error;
    }
  }

  // Helper methods
  calculateOverallHealth(report) {
    let healthScore = 100;

    // Deduct points for component failures
    for (const [component, status] of Object.entries(report.components)) {
      if (status.status === 'ERROR') {
        healthScore -= 25;
      }
    }

    // Deduct points for drift detection
    if (report.summary.driftDetected) {
      healthScore -= 15;
    }

    // Deduct points for validation failures
    if (report.components.validation?.data?.successRate < 90) {
      healthScore -= 10;
    }

    if (healthScore >= 90) return 'EXCELLENT';
    if (healthScore >= 75) return 'GOOD';
    if (healthScore >= 60) return 'FAIR';
    if (healthScore >= 45) return 'POOR';
    return 'CRITICAL';
  }

  generateConfigurationRecommendations(report) {
    const recommendations = [];

    // Component failure recommendations
    const failedComponents = Object.entries(report.components)
      .filter(([, status]) => status.status === 'ERROR');

    if (failedComponents.length > 0) {
      recommendations.push({
        type: 'COMPONENT_FAILURES',
        priority: 'HIGH',
        message: `${failedComponents.length} configuration components have failures`,
        components: failedComponents.map(([name]) => name),
        action: 'Review and fix component failures immediately'
      });
    }

    // Drift detection recommendations
    if (report.summary.driftDetected) {
      recommendations.push({
        type: 'CONFIGURATION_DRIFT',
        priority: 'MEDIUM',
        message: 'Configuration drift detected across environments',
        action: 'Review drift report and implement corrective measures'
      });
    }

    // Secret rotation recommendations
    if (report.components.secrets?.data?.rotationsOverdue > 0) {
      recommendations.push({
        type: 'OVERDUE_SECRET_ROTATION',
        priority: 'HIGH',
        message: `${report.components.secrets.data.rotationsOverdue} secrets are overdue for rotation`,
        action: 'Execute overdue secret rotations immediately'
      });
    }

    return recommendations;
  }

  // Public API methods
  getSystemStatus() {
    return {
      initialized: this.initialized,
      components: {
        configuration: this.managers.config.listConfigurations(),
        validation: this.managers.validator.getValidationHistory(10),
        secrets: this.managers.secrets.getActiveSecrets().length,
        drift: this.managers.drift.getMonitoringStatus()
      }
    };
  }

  async validateAllConfigurations(environment = null) {
    const validations = [];
    const configurations = this.managers.config.listConfigurations();

    for (const [configName, envs] of Object.entries(configurations)) {
      for (const [env, configData] of Object.entries(envs)) {
        if (!environment || env === environment) {
          try {
            const config = this.managers.config.getConfiguration(configName, env);
            const validation = await this.managers.validator.validateEnvironmentConfig(
              configName,
              config,
              env
            );
            validations.push(validation);
          } catch (error) {
            validations.push({
              configType: configName,
              environment: env,
              valid: false,
              errors: [error.message]
            });
          }
        }
      }
    }

    return validations;
  }

  async executeSecretRotation(secretId = null) {
    if (secretId) {
      return await this.managers.secrets.rotateSecret(secretId);
    } else {
      // Rotate all overdue secrets
      const activeSecrets = this.managers.secrets.getActiveSecrets();
      const results = [];

      for (const secret of activeSecrets) {
        if (secret.nextRotation && secret.nextRotation <= new Date()) {
          try {
            const result = await this.managers.secrets.rotateSecret(secret.secretId);
            results.push(result);
          } catch (error) {
            results.push({
              secretId: secret.secretId,
              success: false,
              error: error.message
            });
          }
        }
      }

      return results;
    }
  }
}

// Export singleton instance
export const unifiedConfigurationManager = new UnifiedConfigurationManager();
