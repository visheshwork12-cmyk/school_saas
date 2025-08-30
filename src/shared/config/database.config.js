// src/shared/config/database.config.js - Comprehensive database configuration
import appConfig from './app.config.js';
import { logger } from '#utils/core/logger.js';

/**
 * Database Configuration Manager
 * Handles multiple database connections with failover and load balancing
 */
class DatabaseConfig {
  constructor() {
    this.connections = new Map();
    this.environment = appConfig.get('app.environment');
    this.loadConfigurations();
  }

  loadConfigurations() {
    // MongoDB configurations
    this.configurations = {
      mongodb: {
        primary: {
          name: 'mongodb-primary',
          uri: appConfig.get('database.mongodb.uri'),
          options: {
            ...appConfig.get('database.mongodb.options'),
            readPreference: 'primary',
            replicaSet: process.env.MONGO_REPLICA_SET,
            // ssl: process.env.MONGO_SSL === 'true',
            // sslCA: process.env.MONGO_SSL_CA_PATH,
            // sslCert: process.env.MONGO_SSL_CERT_PATH,
            // sslKey: process.env.MONGO_SSL_KEY_PATH,
            authSource: process.env.MONGO_AUTH_SOURCE || 'admin',
            authMechanism: process.env.MONGO_AUTH_MECHANISM || 'SCRAM-SHA-256'
          },
          pool: {
            maxPoolSize: this.getPoolSize('primary'),
            minPoolSize: Math.ceil(this.getPoolSize('primary') * 0.2),
            maxIdleTimeMS: 300000,
            waitQueueMultiple: 10,
            waitQueueTimeoutMS: 10000
          }
        },

        replica: {
          name: 'mongodb-replica',
          uri: process.env.MONGODB_REPLICA_URI || appConfig.get('database.mongodb.uri'),
          options: {
            ...appConfig.get('database.mongodb.options'),
            readPreference: 'secondaryPreferred',
            readConcern: { level: 'majority' },
            replicaSet: process.env.MONGO_REPLICA_SET
          },
          pool: {
            maxPoolSize: Math.ceil(this.getPoolSize('primary') * 0.7),
            minPoolSize: 2
          }
        },

        analytics: {
          name: 'mongodb-analytics',
          uri: process.env.MONGODB_ANALYTICS_URI || appConfig.get('database.mongodb.uri'),
          options: {
            ...appConfig.get('database.mongodb.options'),
            readPreference: 'secondary',
            readConcern: { level: 'available' },
            maxPoolSize: 5,
            // bufferCommands: false
          }
        }
      },

      // Connection health check settings
      healthCheck: {
        interval: 30000,
        timeout: 10000,
        retries: 3,
        enabled: true
      },

      // Connection retry settings
      retry: {
        attempts: 5,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
      },

      // Failover settings
      failover: {
        enabled: true,
        checkInterval: 15000,
        recoveryTime: 60000,
        maxFailures: 3
      }
    };
  }

  getPoolSize(type) {
    const baseSize = {
      development: { primary: 5, replica: 3 },
      staging: { primary: 15, replica: 10 },
      production: { primary: 25, replica: 15 }
    };

    return baseSize[this.environment]?.[type] || baseSize.development[type];
  }

  /**
   * Get database configuration by purpose
   */
  getConfig(purpose = 'primary') {
    const configs = {
      // Primary database for writes
      primary: this.configurations.mongodb.primary,
      
      // Read replicas for read operations
      read: this.configurations.mongodb.replica,
      
      // Analytics database for reporting
      analytics: this.configurations.mongodb.analytics,
      
      // Tenant-specific configurations
      tenant: (tenantId) => ({
        ...this.configurations.mongodb.primary,
        uri: this.getTenantUri(tenantId),
        options: {
          ...this.configurations.mongodb.primary.options,
          dbName: this.getTenantDbName(tenantId)
        }
      })
    };

    return configs[purpose] || configs.primary;
  }

  getTenantUri(tenantId) {
    const baseUri = appConfig.get('database.mongodb.uri');
    
    // Multi-tenant URI strategies
    if (appConfig.get('multiTenant.isolationLevel') === 'database') {
      return baseUri.replace(/\/([^/?]+)/, `/school_${tenantId}`);
    }
    
    return baseUri;
  }

  getTenantDbName(tenantId) {
    if (appConfig.get('multiTenant.isolationLevel') === 'database') {
      return `school_${tenantId}`;
    }
    
    return null; // Use default database name
  }

  /**
   * Get connection string with credentials masked
   */
  getMaskedUri(uri) {
    return uri.replace(/:\/\/.*@/, '://***:***@');
  }

  /**
   * Validate database configuration
   */
  validateConfiguration() {
    const requiredSettings = [
      'database.mongodb.uri'
    ];

    const missing = requiredSettings.filter(setting => !appConfig.get(setting));
    
    if (missing.length > 0) {
      const error = `Missing database configuration: ${missing.join(', ')}`;
      logger.error(error);
      
      if (appConfig.isProduction()) {
        throw new Error(error);
      }
    }

    // Validate URI format
    const uri = appConfig.get('database.mongodb.uri');
    if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB URI format');
    }

    logger.info('✅ Database configuration validated');
    return true;
  }

  /**
   * Get environment-specific optimizations
   */
  getEnvironmentOptimizations() {
    const optimizations = {
      development: {
        serverSelectionTimeoutMS: 5000,
        heartbeatFrequencyMS: 30000,
        // bufferCommands: true,
        // bufferMaxEntries: -1
      },
      
      staging: {
        serverSelectionTimeoutMS: 8000,
        heartbeatFrequencyMS: 10000,
        // bufferCommands: false,
        compressors: ['zlib']
      },
      
      production: {
        serverSelectionTimeoutMS: 10000,
        heartbeatFrequencyMS: 10000,
        // bufferCommands: false,
        compressors: ['zlib', 'zstd'],
        zlibCompressionLevel: 6,
        journal: true,
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true }
      }
    };

    return optimizations[this.environment] || optimizations.development;
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig() {
    return {
      commandMonitoring: appConfig.isDevelopment(),
      serverMonitoring: true,
      topologyMonitoring: true,
      loggerLevel: appConfig.isDevelopment() ? 'debug' : 'info',
      maxConnecting: 2,
      serverMonitoringMode: 'stream'
    };
  }

  /**
   * Get complete configuration for a connection
   */
  getCompleteConfig(purpose = 'primary', tenantId = null) {
    const baseConfig = tenantId ? 
      this.getConfig('tenant')(tenantId) : 
      this.getConfig(purpose);

    return {
      ...baseConfig,
      options: {
        ...baseConfig.options,
        ...this.getEnvironmentOptimizations(),
        ...this.getMonitoringConfig()
      },
      healthCheck: this.configurations.healthCheck,
      retry: this.configurations.retry,
      failover: this.configurations.failover
    };
  }

  /**
   * Get all configurations
   */
  getAllConfigs() {
    return {
      primary: this.getCompleteConfig('primary'),
      read: this.getCompleteConfig('read'),
      analytics: this.getCompleteConfig('analytics'),
      healthCheck: this.configurations.healthCheck,
      retry: this.configurations.retry,
      failover: this.configurations.failover
    };
  }
}

// Export singleton instance
const databaseConfig = new DatabaseConfig();
databaseConfig.validateConfiguration();

export default databaseConfig;
export { DatabaseConfig };
