// src/infrastructure/config/advanced-config-manager.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import yaml from "js-yaml";

/**
 * Advanced Configuration Manager
 * Centralized configuration management with environment validation and drift detection
 */
export class AdvancedConfigManager extends EventEmitter {
  constructor() {
    super();
    this.configurations = new Map();
    this.schemas = new Map();
    this.environments = new Map();
    this.configHistory = new Map();
    this.validators = new Map();
    this.watchers = new Map();
    this.initializeConfigManager();
  }

  /**
   * Initialize configuration manager
   */
  initializeConfigManager() {
    this.setupDefaultEnvironments();
    this.setupConfigurationSchemas();
    this.setupValidators();
    this.startConfigurationWatching();
  }

  /**
   * Setup default environments
   */
  setupDefaultEnvironments() {
    // Development Environment
    this.addEnvironment('development', {
      name: 'Development',
      description: 'Local development environment',
      tier: 'development',
      security: {
        requireEncryption: false,
        allowDebugMode: true,
        strictValidation: false
      },
      resources: {
        maxCpuCores: 4,
        maxMemoryGB: 8,
        maxStorageGB: 100
      },
      features: {
        allowExperimentalFeatures: true,
        enableDetailedLogging: true,
        skipCacheWarming: true
      }
    });

    // Staging Environment
    this.addEnvironment('staging', {
      name: 'Staging',
      description: 'Pre-production testing environment',
      tier: 'staging',
      security: {
        requireEncryption: true,
        allowDebugMode: false,
        strictValidation: true
      },
      resources: {
        maxCpuCores: 8,
        maxMemoryGB: 16,
        maxStorageGB: 500
      },
      features: {
        allowExperimentalFeatures: true,
        enableDetailedLogging: false,
        skipCacheWarming: false
      }
    });

    // Production Environment
    this.addEnvironment('production', {
      name: 'Production',
      description: 'Live production environment',
      tier: 'production',
      security: {
        requireEncryption: true,
        allowDebugMode: false,
        strictValidation: true,
        requireSecretRotation: true
      },
      resources: {
        maxCpuCores: 32,
        maxMemoryGB: 64,
        maxStorageGB: 2000
      },
      features: {
        allowExperimentalFeatures: false,
        enableDetailedLogging: false,
        skipCacheWarming: false
      }
    });
  }

  /**
   * Setup configuration schemas for validation
   */
  setupConfigurationSchemas() {
    // Database Configuration Schema
    this.addConfigurationSchema('database', {
      type: 'object',
      required: ['host', 'port', 'database', 'username'],
      properties: {
        host: { type: 'string', minLength: 1 },
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        database: { type: 'string', minLength: 1 },
        username: { type: 'string', minLength: 1 },
        password: { type: 'string', minLength: 8 },
        ssl: { type: 'boolean' },
        connectionTimeout: { type: 'integer', minimum: 1000 },
        poolSize: { type: 'integer', minimum: 1, maximum: 100 }
      },
      environmentSpecific: {
        production: {
          required: ['password', 'ssl'],
          properties: {
            ssl: { const: true },
            poolSize: { minimum: 10 }
          }
        },
        development: {
          properties: {
            ssl: { const: false },
            poolSize: { maximum: 5 }
          }
        }
      }
    });

    // Redis Configuration Schema
    this.addConfigurationSchema('redis', {
      type: 'object',
      required: ['host', 'port'],
      properties: {
        host: { type: 'string', minLength: 1 },
        port: { type: 'integer', minimum: 1, maximum: 65535 },
        password: { type: 'string' },
        db: { type: 'integer', minimum: 0, maximum: 15 },
        maxConnections: { type: 'integer', minimum: 1 },
        connectTimeout: { type: 'integer', minimum: 1000 }
      },
      environmentSpecific: {
        production: {
          required: ['password'],
          properties: {
            maxConnections: { minimum: 50 }
          }
        }
      }
    });

    // API Configuration Schema
    this.addConfigurationSchema('api', {
      type: 'object',
      required: ['port', 'baseUrl'],
      properties: {
        port: { type: 'integer', minimum: 1000, maximum: 65535 },
        baseUrl: { type: 'string', format: 'uri' },
        rateLimit: {
          type: 'object',
          properties: {
            windowMs: { type: 'integer', minimum: 1000 },
            max: { type: 'integer', minimum: 1 }
          }
        },
        cors: {
          type: 'object',
          properties: {
            origin: { type: 'array', items: { type: 'string' } },
            credentials: { type: 'boolean' }
          }
        },
        jwt: {
          type: 'object',
          required: ['secret', 'expiresIn'],
          properties: {
            secret: { type: 'string', minLength: 32 },
            expiresIn: { type: 'string' },
            algorithm: { type: 'string', enum: ['HS256', 'HS384', 'HS512'] }
          }
        }
      },
      environmentSpecific: {
        production: {
          properties: {
            rateLimit: {
              required: ['windowMs', 'max'],
              properties: {
                max: { maximum: 1000 }
              }
            }
          }
        }
      }
    });

    // AWS Configuration Schema
    this.addConfigurationSchema('aws', {
      type: 'object',
      required: ['region'],
      properties: {
        region: { type: 'string', minLength: 1 },
        accessKeyId: { type: 'string' },
        secretAccessKey: { type: 'string' },
        s3: {
          type: 'object',
          properties: {
            bucket: { type: 'string', minLength: 1 },
            region: { type: 'string' }
          }
        },
        ses: {
          type: 'object',
          properties: {
            from: { type: 'string', format: 'email' },
            region: { type: 'string' }
          }
        }
      }
    });
  }

  /**
   * Setup custom validators
   */
  setupValidators() {
    // Environment-specific validator
    this.addValidator('environment-specific', async (config, environment, schema) => {
      const envConfig = this.environments.get(environment);
      if (!envConfig) {
        throw new Error(`Unknown environment: ${environment}`);
      }

      // Check resource constraints
      if (config.resources) {
        if (config.resources.cpu > envConfig.resources.maxCpuCores) {
          throw new Error(`CPU allocation exceeds environment limit: ${config.resources.cpu} > ${envConfig.resources.maxCpuCores}`);
        }
        if (config.resources.memory > envConfig.resources.maxMemoryGB) {
          throw new Error(`Memory allocation exceeds environment limit: ${config.resources.memory} > ${envConfig.resources.maxMemoryGB}`);
        }
      }

      // Check security requirements
      if (envConfig.security.requireEncryption && !config.ssl && !config.tls) {
        throw new Error(`Encryption is required for ${environment} environment`);
      }

      return true;
    });

    // Secret validator
    this.addValidator('secrets', async (config, environment) => {
      const secretFields = ['password', 'secret', 'key', 'token'];
      
      for (const [key, value] of Object.entries(config)) {
        if (secretFields.some(field => key.toLowerCase().includes(field))) {
          if (typeof value !== 'string' || value.length < 8) {
            throw new Error(`Secret field '${key}' must be a string with minimum 8 characters`);
          }
          
          // Check for production environment requirements
          if (environment === 'production' && value.length < 32) {
            throw new Error(`Secret field '${key}' must be at least 32 characters in production`);
          }
        }
      }

      return true;
    });

    // URL validator
    this.addValidator('urls', async (config) => {
      const urlFields = ['baseUrl', 'url', 'endpoint', 'host'];
      
      for (const [key, value] of Object.entries(config)) {
        if (urlFields.some(field => key.toLowerCase().includes(field)) && typeof value === 'string') {
          try {
            new URL(value);
          } catch (error) {
            throw new Error(`Invalid URL format for field '${key}': ${value}`);
          }
        }
      }

      return true;
    });
  }

  /**
   * Load configuration for environment
   */
  async loadConfiguration(configName, environment = 'development') {
    try {
      logger.info(`Loading configuration: ${configName} for environment: ${environment}`);

      // Check if environment exists
      if (!this.environments.has(environment)) {
        throw new Error(`Unknown environment: ${environment}`);
      }

      // Load base configuration
      const baseConfig = await this.loadConfigurationFile(configName, 'base');
      
      // Load environment-specific configuration
      let envConfig = {};
      try {
        envConfig = await this.loadConfigurationFile(configName, environment);
      } catch (error) {
        logger.debug(`No environment-specific config found for ${configName}.${environment}, using base only`);
      }

      // Merge configurations
      const mergedConfig = this.mergeConfigurations(baseConfig, envConfig);

      // Validate configuration
      await this.validateConfiguration(configName, mergedConfig, environment);

      // Store configuration
      const configKey = `${configName}.${environment}`;
      this.configurations.set(configKey, {
        name: configName,
        environment,
        config: mergedConfig,
        loadedAt: new Date(),
        checksum: this.calculateChecksum(mergedConfig)
      });

      // Record configuration history
      this.recordConfigurationHistory(configKey, mergedConfig, 'loaded');

      // Emit configuration loaded event
      this.emit('configurationLoaded', { configName, environment, config: mergedConfig });

      logger.info(`Configuration loaded successfully: ${configName}.${environment}`);
      return mergedConfig;

    } catch (error) {
      logger.error(`Failed to load configuration ${configName}.${environment}:`, error);
      throw error;
    }
  }

  /**
   * Save configuration
   */
  async saveConfiguration(configName, config, environment = 'development') {
    try {
      logger.info(`Saving configuration: ${configName} for environment: ${environment}`);

      // Validate configuration before saving
      await this.validateConfiguration(configName, config, environment);

      // Create configuration directory if it doesn't exist
      const configDir = path.join('config', 'environments');
      await fs.mkdir(configDir, { recursive: true });

      // Determine file path
      const filename = environment === 'base' 
        ? `${configName}.yaml` 
        : `${configName}.${environment}.yaml`;
      const filepath = path.join(configDir, filename);

      // Create backup of existing configuration
      try {
        const existingContent = await fs.readFile(filepath, 'utf-8');
        const backupPath = `${filepath}.backup.${Date.now()}`;
        await fs.writeFile(backupPath, existingContent);
        logger.debug(`Configuration backup created: ${backupPath}`);
      } catch (error) {
        // File doesn't exist, no backup needed
      }

      // Save configuration
      const yamlContent = yaml.dump(config, {
        indent: 2,
        lineWidth: 120,
        noRefs: true
      });

      await fs.writeFile(filepath, yamlContent, 'utf-8');

      // Update in-memory configuration
      const configKey = `${configName}.${environment}`;
      this.configurations.set(configKey, {
        name: configName,
        environment,
        config,
        savedAt: new Date(),
        checksum: this.calculateChecksum(config)
      });

      // Record configuration history
      this.recordConfigurationHistory(configKey, config, 'saved');

      // Emit configuration saved event
      this.emit('configurationSaved', { configName, environment, config });

      logger.info(`Configuration saved successfully: ${configName}.${environment}`);
      return { success: true, filepath };

    } catch (error) {
      logger.error(`Failed to save configuration ${configName}.${environment}:`, error);
      throw error;
    }
  }

  /**
   * Validate configuration against schema
   */
  async validateConfiguration(configName, config, environment) {
    try {
      const schema = this.schemas.get(configName);
      if (!schema) {
        logger.warn(`No schema found for configuration: ${configName}`);
        return true;
      }

      // Basic JSON Schema validation
      const isValid = await this.validateAgainstSchema(config, schema);
      if (!isValid) {
        throw new Error(`Configuration validation failed against base schema`);
      }

      // Environment-specific validation
      if (schema.environmentSpecific && schema.environmentSpecific[environment]) {
        const envSchema = {
          ...schema,
          ...schema.environmentSpecific[environment]
        };
        
        const isEnvValid = await this.validateAgainstSchema(config, envSchema);
        if (!isEnvValid) {
          throw new Error(`Configuration validation failed against ${environment} environment schema`);
        }
      }

      // Run custom validators
      for (const [validatorName, validator] of this.validators) {
        try {
          await validator(config, environment, schema);
        } catch (error) {
          throw new Error(`Validator '${validatorName}' failed: ${error.message}`);
        }
      }

      logger.debug(`Configuration validation passed: ${configName}.${environment}`);
      return true;

    } catch (error) {
      logger.error(`Configuration validation failed: ${configName}.${environment}`, error);
      throw error;
    }
  }

  /**
   * Get configuration with fallback
   */
  getConfiguration(configName, environment = 'development') {
    const configKey = `${configName}.${environment}`;
    const configData = this.configurations.get(configKey);
    
    if (!configData) {
      // Try to fallback to base configuration
      const baseKey = `${configName}.base`;
      const baseConfig = this.configurations.get(baseKey);
      
      if (baseConfig) {
        logger.warn(`Using base configuration for ${configName}.${environment}`);
        return baseConfig.config;
      }
      
      throw new Error(`Configuration not found: ${configName}.${environment}`);
    }
    
    return configData.config;
  }

  /**
   * Watch configuration files for changes
   */
  startConfigurationWatching() {
    const configDir = path.join('config', 'environments');
    
    // Watch for configuration file changes
    setInterval(async () => {
      try {
        await this.checkConfigurationChanges();
      } catch (error) {
        logger.error('Configuration watching failed:', error);
      }
    }, 30000); // Check every 30 seconds

    logger.info('Configuration watching started');
  }

  /**
   * Check for configuration changes
   */
  async checkConfigurationChanges() {
    for (const [configKey, configData] of this.configurations) {
      try {
        const [configName, environment] = configKey.split('.');
        const currentConfig = await this.loadConfigurationFile(configName, environment);
        const currentChecksum = this.calculateChecksum(currentConfig);
        
        if (currentChecksum !== configData.checksum) {
          logger.warn(`Configuration drift detected: ${configKey}`);
          
          // Emit drift detection event
          this.emit('configurationDrift', {
            configKey,
            oldChecksum: configData.checksum,
            newChecksum: currentChecksum,
            configName,
            environment
          });
          
          // Record drift in history
          this.recordConfigurationHistory(configKey, currentConfig, 'drift_detected');
        }
      } catch (error) {
        logger.error(`Failed to check configuration changes for ${configKey}:`, error);
      }
    }
  }

  /**
   * Generate configuration report
   */
  async generateConfigurationReport() {
    try {
      const report = {
        generatedAt: new Date(),
        totalConfigurations: this.configurations.size,
        environments: Array.from(this.environments.keys()),
        schemas: Array.from(this.schemas.keys()),
        configurations: {},
        validation: {
          passed: 0,
          failed: 0,
          warnings: []
        },
        drift: {
          detected: 0,
          configurations: []
        }
      };

      // Analyze each configuration
      for (const [configKey, configData] of this.configurations) {
        const [configName, environment] = configKey.split('.');
        
        if (!report.configurations[configName]) {
          report.configurations[configName] = {};
        }

        // Re-validate configuration
        let validationResult = { valid: true, errors: [] };
        try {
          await this.validateConfiguration(configName, configData.config, environment);
          report.validation.passed++;
        } catch (error) {
          validationResult = { valid: false, errors: [error.message] };
          report.validation.failed++;
        }

        report.configurations[configName][environment] = {
          loadedAt: configData.loadedAt,
          savedAt: configData.savedAt,
          checksum: configData.checksum,
          validation: validationResult,
          size: JSON.stringify(configData.config).length
        };
      }

      // Check for configuration drift
      await this.checkConfigurationChanges();

      // Add drift information
      const driftEvents = this.getConfigurationHistory()
        .filter(event => event.action === 'drift_detected');
      
      report.drift.detected = driftEvents.length;
      report.drift.configurations = driftEvents.map(event => ({
        configKey: event.configKey,
        detectedAt: event.timestamp
      }));

      logger.info('Configuration report generated', {
        totalConfigurations: report.totalConfigurations,
        validationPassed: report.validation.passed,
        validationFailed: report.validation.failed,
        driftDetected: report.drift.detected
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate configuration report:', error);
      throw error;
    }
  }

  // Helper methods
  async loadConfigurationFile(configName, environment) {
    const filename = environment === 'base' 
      ? `${configName}.yaml` 
      : `${configName}.${environment}.yaml`;
    const filepath = path.join('config', 'environments', filename);
    
    const content = await fs.readFile(filepath, 'utf-8');
    return yaml.load(content);
  }

  mergeConfigurations(base, override) {
    // Deep merge configurations
    const merged = JSON.parse(JSON.stringify(base));
    
    function deepMerge(target, source) {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    }
    
    deepMerge(merged, override);
    return merged;
  }

  calculateChecksum(config) {
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash('sha256').update(configString).digest('hex');
  }

  async validateAgainstSchema(config, schema) {
    // Simplified JSON Schema validation
    // In production, use a proper JSON Schema library like ajv
    try {
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in config)) {
            throw new Error(`Required field missing: ${field}`);
          }
        }
      }
      return true;
    } catch (error) {
      throw new Error(`Schema validation failed: ${error.message}`);
    }
  }

  recordConfigurationHistory(configKey, config, action) {
    if (!this.configHistory.has(configKey)) {
      this.configHistory.set(configKey, []);
    }
    
    const history = this.configHistory.get(configKey);
    history.push({
      configKey,
      action,
      timestamp: new Date(),
      checksum: this.calculateChecksum(config),
      size: JSON.stringify(config).length
    });

    // Keep only last 100 history entries per configuration
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
  }

  // Public API methods
  addEnvironment(envId, envConfig) {
    this.environments.set(envId, envConfig);
  }

  addConfigurationSchema(schemaId, schema) {
    this.schemas.set(schemaId, schema);
  }

  addValidator(validatorId, validator) {
    this.validators.set(validatorId, validator);
  }

  getEnvironments() {
    return Array.from(this.environments.keys());
  }

  getSchemas() {
    return Array.from(this.schemas.keys());
  }

  getConfigurationHistory(configKey = null) {
    if (configKey) {
      return this.configHistory.get(configKey) || [];
    }
    
    const allHistory = [];
    for (const history of this.configHistory.values()) {
      allHistory.push(...history);
    }
    
    return allHistory.sort((a, b) => b.timestamp - a.timestamp);
  }

  listConfigurations() {
    const configs = {};
    for (const [configKey, configData] of this.configurations) {
      const [configName, environment] = configKey.split('.');
      
      if (!configs[configName]) {
        configs[configName] = {};
      }
      
      configs[configName][environment] = {
        loadedAt: configData.loadedAt,
        checksum: configData.checksum
      };
    }
    return configs;
  }
}

// Export singleton instance
export const advancedConfigManager = new AdvancedConfigManager();
