// src/infrastructure/config/environment-config-validator.js
import { logger } from "#utils/core/logger.js";
import Ajv from "ajv";
import addFormats from "ajv-formats";

/**
 * Environment-specific Configuration Validator
 * Validates configurations against environment-specific rules and constraints
 */
export class EnvironmentConfigValidator {
  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(this.ajv);
    
    this.environmentRules = new Map();
    this.validationRules = new Map();
    this.customValidators = new Map();
    this.validationHistory = [];
    
    this.initializeValidationRules();
  }

  /**
   * Initialize environment-specific validation rules
   */
  initializeValidationRules() {
    // Development environment rules
    this.addEnvironmentRules('development', {
      name: 'Development Environment Validation',
      description: 'Validation rules for development environment',
      allowedFeatures: [
        'debug_mode',
        'hot_reload',
        'detailed_logging',
        'experimental_features',
        'mock_services'
      ],
      securityRequirements: {
        encryption: 'optional',
        authentication: 'basic',
        secretMinLength: 8,
        allowWeakPasswords: true
      },
      resourceLimits: {
        maxCpuCores: 4,
        maxMemoryGB: 8,
        maxDiskGB: 100,
        maxConnections: 100
      },
      networkRestrictions: {
        allowedPorts: [3000, 3001, 5432, 6379, 8080, 9000],
        requireSSL: false,
        allowInsecureConnections: true
      }
    });

    // Staging environment rules
    this.addEnvironmentRules('staging', {
      name: 'Staging Environment Validation',
      description: 'Validation rules for staging environment',
      allowedFeatures: [
        'performance_monitoring',
        'load_testing',
        'integration_testing',
        'experimental_features'
      ],
      securityRequirements: {
        encryption: 'required',
        authentication: 'strong',
        secretMinLength: 16,
        allowWeakPasswords: false,
        requireMFA: false
      },
      resourceLimits: {
        maxCpuCores: 8,
        maxMemoryGB: 16,
        maxDiskGB: 500,
        maxConnections: 500
      },
      networkRestrictions: {
        allowedPorts: [80, 443, 5432, 6379],
        requireSSL: true,
        allowInsecureConnections: false
      }
    });

    // Production environment rules
    this.addEnvironmentRules('production', {
      name: 'Production Environment Validation',
      description: 'Validation rules for production environment',
      allowedFeatures: [
        'monitoring',
        'alerting',
        'backup',
        'disaster_recovery',
        'auto_scaling'
      ],
      securityRequirements: {
        encryption: 'required',
        authentication: 'strong',
        secretMinLength: 32,
        allowWeakPasswords: false,
        requireMFA: true,
        requireSecretRotation: true
      },
      resourceLimits: {
        maxCpuCores: 64,
        maxMemoryGB: 128,
        maxDiskGB: 2000,
        maxConnections: 2000
      },
      networkRestrictions: {
        allowedPorts: [80, 443],
        requireSSL: true,
        allowInsecureConnections: false,
        requireFirewall: true
      }
    });

    // Setup custom validators
    this.setupCustomValidators();
  }

  /**
   * Setup custom validation functions
   */
  setupCustomValidators() {
    // Database configuration validator
    this.addCustomValidator('database', async (config, environment, rules) => {
      const errors = [];

      // Check connection security
      if (rules.securityRequirements.encryption === 'required' && !config.ssl) {
        errors.push('SSL/TLS encryption is required for database connections in this environment');
      }

      // Check connection pool size
      if (config.poolSize > rules.resourceLimits.maxConnections) {
        errors.push(`Database pool size (${config.poolSize}) exceeds environment limit (${rules.resourceLimits.maxConnections})`);
      }

      // Check password strength
      if (config.password) {
        if (config.password.length < rules.securityRequirements.secretMinLength) {
          errors.push(`Database password must be at least ${rules.securityRequirements.secretMinLength} characters`);
        }

        if (!rules.securityRequirements.allowWeakPasswords) {
          if (!this.isStrongPassword(config.password)) {
            errors.push('Database password does not meet strength requirements');
          }
        }
      }

      return errors;
    });

    // API configuration validator
    this.addCustomValidator('api', async (config, environment, rules) => {
      const errors = [];

      // Check port restrictions
      if (config.port && !rules.networkRestrictions.allowedPorts.includes(config.port)) {
        errors.push(`Port ${config.port} is not allowed in ${environment} environment`);
      }

      // Check SSL requirements
      if (rules.networkRestrictions.requireSSL && !config.https) {
        errors.push('HTTPS is required in this environment');
      }

      // Check JWT secret strength
      if (config.jwt && config.jwt.secret) {
        if (config.jwt.secret.length < rules.securityRequirements.secretMinLength) {
          errors.push(`JWT secret must be at least ${rules.securityRequirements.secretMinLength} characters`);
        }
      }

      // Check rate limiting in production
      if (environment === 'production' && !config.rateLimit) {
        errors.push('Rate limiting must be configured in production environment');
      }

      return errors;
    });

    // AWS configuration validator
    this.addCustomValidator('aws', async (config, environment, rules) => {
      const errors = [];

      // Check region configuration
      if (!config.region) {
        errors.push('AWS region must be specified');
      }

      // Check credentials handling
      if (environment === 'production' && (config.accessKeyId || config.secretAccessKey)) {
        errors.push('Hard-coded AWS credentials are not allowed in production (use IAM roles instead)');
      }

      // Check S3 bucket configuration
      if (config.s3 && config.s3.bucket) {
        if (!config.s3.bucket.includes(environment)) {
          errors.push('S3 bucket name should include environment identifier');
        }
      }

      return errors;
    });

    // Redis configuration validator
    this.addCustomValidator('redis', async (config, environment, rules) => {
      const errors = [];

      // Check authentication
      if (rules.securityRequirements.authentication !== 'basic' && !config.password) {
        errors.push('Redis password is required in this environment');
      }

      // Check connection limits
      if (config.maxConnections > rules.resourceLimits.maxConnections) {
        errors.push(`Redis max connections (${config.maxConnections}) exceeds environment limit`);
      }

      return errors;
    });

    // Monitoring configuration validator
    this.addCustomValidator('monitoring', async (config, environment, rules) => {
      const errors = [];

      // Check required monitoring features
      if (environment === 'production') {
        const requiredMetrics = ['cpu', 'memory', 'disk', 'network', 'application'];
        
        if (!config.metrics || !config.metrics.enabled) {
          errors.push('Metrics monitoring is required in production');
        }

        if (config.metrics && config.metrics.enabled) {
          for (const metric of requiredMetrics) {
            if (!config.metrics.types || !config.metrics.types.includes(metric)) {
              errors.push(`${metric} monitoring is required in production`);
            }
          }
        }

        // Check alerting configuration
        if (!config.alerts || !config.alerts.enabled) {
          errors.push('Alerting is required in production environment');
        }
      }

      return errors;
    });
  }

  /**
   * Validate configuration for specific environment
   */
  async validateEnvironmentConfig(configType, config, environment) {
    try {
      logger.info(`Validating ${configType} configuration for ${environment} environment`);

      const validationResult = {
        configType,
        environment,
        timestamp: new Date(),
        valid: true,
        errors: [],
        warnings: [],
        recommendations: []
      };

      // Get environment rules
      const environmentRules = this.environmentRules.get(environment);
      if (!environmentRules) {
        throw new Error(`No validation rules found for environment: ${environment}`);
      }

      // Run base validation
      const baseErrors = await this.runBaseValidation(config, environmentRules);
      validationResult.errors.push(...baseErrors);

      // Run custom validator if available
      const customValidator = this.customValidators.get(configType);
      if (customValidator) {
        const customErrors = await customValidator(config, environment, environmentRules);
        validationResult.errors.push(...customErrors);
      }

      // Run environment-specific checks
      const envErrors = await this.runEnvironmentSpecificChecks(config, environment, environmentRules);
      validationResult.errors.push(...envErrors);

      // Generate warnings and recommendations
      const warnings = this.generateWarnings(config, environment, environmentRules);
      validationResult.warnings.push(...warnings);

      const recommendations = this.generateRecommendations(config, environment, environmentRules);
      validationResult.recommendations.push(...recommendations);

      // Determine overall validity
      validationResult.valid = validationResult.errors.length === 0;

      // Store validation history
      this.validationHistory.push(validationResult);

      // Keep only last 1000 validation results
      if (this.validationHistory.length > 1000) {
        this.validationHistory = this.validationHistory.slice(-1000);
      }

      if (validationResult.valid) {
        logger.info(`Environment validation passed: ${configType}.${environment}`);
      } else {
        logger.error(`Environment validation failed: ${configType}.${environment}`, {
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length
        });
      }

      return validationResult;

    } catch (error) {
      logger.error(`Environment validation error: ${configType}.${environment}`, error);
      throw error;
    }
  }

  /**
   * Run base validation checks
   */
  async runBaseValidation(config, rules) {
    const errors = [];

    // Check resource limits
    if (config.resources) {
      if (config.resources.cpu > rules.resourceLimits.maxCpuCores) {
        errors.push(`CPU allocation (${config.resources.cpu}) exceeds limit (${rules.resourceLimits.maxCpuCores})`);
      }
      if (config.resources.memory > rules.resourceLimits.maxMemoryGB) {
        errors.push(`Memory allocation (${config.resources.memory}GB) exceeds limit (${rules.resourceLimits.maxMemoryGB}GB)`);
      }
      if (config.resources.storage > rules.resourceLimits.maxDiskGB) {
        errors.push(`Storage allocation (${config.resources.storage}GB) exceeds limit (${rules.resourceLimits.maxDiskGB}GB)`);
      }
    }

    return errors;
  }

  /**
   * Run environment-specific validation checks
   */
  async runEnvironmentSpecificChecks(config, environment, rules) {
    const errors = [];

    // Check forbidden features
    if (config.features) {
      for (const [feature, enabled] of Object.entries(config.features)) {
        if (enabled && !rules.allowedFeatures.includes(feature)) {
          errors.push(`Feature '${feature}' is not allowed in ${environment} environment`);
        }
      }
    }

    // Check debug mode restrictions
    if (config.debug === true && environment === 'production') {
      errors.push('Debug mode must be disabled in production environment');
    }

    // Check logging level restrictions
    if (config.logging && config.logging.level === 'debug' && environment === 'production') {
      errors.push('Debug logging is not recommended in production environment');
    }

    return errors;
  }

  /**
   * Generate warnings for potential issues
   */
  generateWarnings(config, environment, rules) {
    const warnings = [];

    // Performance warnings
    if (config.resources) {
      const cpuUsage = (config.resources.cpu / rules.resourceLimits.maxCpuCores) * 100;
      if (cpuUsage > 80) {
        warnings.push(`High CPU allocation: using ${cpuUsage.toFixed(1)}% of environment limit`);
      }

      const memUsage = (config.resources.memory / rules.resourceLimits.maxMemoryGB) * 100;
      if (memUsage > 80) {
        warnings.push(`High memory allocation: using ${memUsage.toFixed(1)}% of environment limit`);
      }
    }

    // Security warnings
    if (environment !== 'development') {
      if (config.cors && config.cors.origin && config.cors.origin.includes('*')) {
        warnings.push('Wildcard CORS origin is not recommended for non-development environments');
      }

      if (config.rateLimit && config.rateLimit.max > 1000) {
        warnings.push('High rate limit may impact security in production environment');
      }
    }

    return warnings;
  }

  /**
   * Generate recommendations for optimization
   */
  generateRecommendations(config, environment, rules) {
    const recommendations = [];

    // Performance recommendations
    if (environment === 'production') {
      if (!config.caching || !config.caching.enabled) {
        recommendations.push('Consider enabling caching for better performance in production');
      }

      if (!config.compression || !config.compression.enabled) {
        recommendations.push('Enable response compression for better performance');
      }

      if (!config.monitoring || !config.monitoring.enabled) {
        recommendations.push('Enable comprehensive monitoring in production environment');
      }
    }

    // Security recommendations
    if (config.password && this.isWeakPassword(config.password)) {
      recommendations.push('Consider using a stronger password with mixed case, numbers, and symbols');
    }

    if (environment !== 'development' && config.allowInsecureConnections) {
      recommendations.push('Disable insecure connections in non-development environments');
    }

    return recommendations;
  }

  /**
   * Validate configuration schema
   */
  async validateConfigSchema(config, schema) {
    try {
      const validate = this.ajv.compile(schema);
      const valid = validate(config);

      if (!valid) {
        const errors = validate.errors.map(error => {
          return `${error.instancePath} ${error.message}`;
        });
        return { valid: false, errors };
      }

      return { valid: true, errors: [] };

    } catch (error) {
      return { valid: false, errors: [error.message] };
    }
  }

  /**
   * Get validation report
   */
  getValidationReport(environment = null, configType = null) {
    let validations = this.validationHistory;

    // Filter by environment if specified
    if (environment) {
      validations = validations.filter(v => v.environment === environment);
    }

    // Filter by config type if specified
    if (configType) {
      validations = validations.filter(v => v.configType === configType);
    }

    const report = {
      generatedAt: new Date(),
      totalValidations: validations.length,
      successRate: validations.length > 0 ? (validations.filter(v => v.valid).length / validations.length) * 100 : 0,
      byEnvironment: {},
      byConfigType: {},
      recentValidations: validations.slice(-10),
      commonErrors: this.getCommonErrors(validations),
      recommendations: this.getTopRecommendations(validations)
    };

    // Group by environment
    for (const validation of validations) {
      if (!report.byEnvironment[validation.environment]) {
        report.byEnvironment[validation.environment] = {
          total: 0,
          passed: 0,
          failed: 0
        };
      }
      report.byEnvironment[validation.environment].total++;
      if (validation.valid) {
        report.byEnvironment[validation.environment].passed++;
      } else {
        report.byEnvironment[validation.environment].failed++;
      }
    }

    // Group by config type
    for (const validation of validations) {
      if (!report.byConfigType[validation.configType]) {
        report.byConfigType[validation.configType] = {
          total: 0,
          passed: 0,
          failed: 0
        };
      }
      report.byConfigType[validation.configType].total++;
      if (validation.valid) {
        report.byConfigType[validation.configType].passed++;
      } else {
        report.byConfigType[validation.configType].failed++;
      }
    }

    return report;
  }

  // Helper methods
  addEnvironmentRules(environment, rules) {
    this.environmentRules.set(environment, rules);
    logger.debug(`Environment rules added: ${environment}`);
  }

  addCustomValidator(configType, validator) {
    this.customValidators.set(configType, validator);
    logger.debug(`Custom validator added: ${configType}`);
  }

  isStrongPassword(password) {
    // Strong password: at least 8 chars, uppercase, lowercase, number, special char
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    return strongRegex.test(password) && password.length >= 8;
  }

  isWeakPassword(password) {
    return !this.isStrongPassword(password);
  }

  getCommonErrors(validations) {
    const errorCounts = {};
    
    for (const validation of validations) {
      for (const error of validation.errors) {
        errorCounts[error] = (errorCounts[error] || 0) + 1;
      }
    }

    return Object.entries(errorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));
  }

  getTopRecommendations(validations) {
    const recommendationCounts = {};
    
    for (const validation of validations) {
      for (const recommendation of validation.recommendations) {
        recommendationCounts[recommendation] = (recommendationCounts[recommendation] || 0) + 1;
      }
    }

    return Object.entries(recommendationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([recommendation, count]) => ({ recommendation, count }));
  }

  getValidationHistory(limit = 100) {
    return this.validationHistory.slice(-limit);
  }

  getEnvironmentRules(environment) {
    return this.environmentRules.get(environment);
  }

  listEnvironments() {
    return Array.from(this.environmentRules.keys());
  }

  listCustomValidators() {
    return Array.from(this.customValidators.keys());
  }
}

// Export singleton instance
export const environmentConfigValidator = new EnvironmentConfigValidator();
