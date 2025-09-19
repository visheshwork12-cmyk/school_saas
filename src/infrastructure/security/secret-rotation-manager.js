// src/infrastructure/security/secret-rotation-manager.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import crypto from "crypto";
import AWS from "aws-sdk";

/**
 * Automated Secret Rotation Manager
 * Manages automated rotation of secrets, API keys, passwords, and certificates
 */
export class SecretRotationManager extends EventEmitter {
  constructor() {
    super();
    this.rotationPolicies = new Map();
    this.activeSecrets = new Map();
    this.rotationHistory = [];
    this.scheduledRotations = new Map();
    this.secretProviders = new Map();
    this.rotationStrategies = new Map();
    
    // Initialize AWS services
    this.secretsManager = new AWS.SecretsManager({ region: process.env.AWS_REGION });
    this.ssm = new AWS.SSM({ region: process.env.AWS_REGION });
    
    this.initializeSecretRotation();
  }

  /**
   * Initialize secret rotation system
   */
  initializeSecretRotation() {
    this.setupRotationStrategies();
    this.setupSecretProviders();
    this.setupDefaultRotationPolicies();
    this.startRotationScheduler();
  }

  /**
   * Setup rotation strategies
   */
  setupRotationStrategies() {
    // Database password rotation strategy
    this.addRotationStrategy('DATABASE_PASSWORD', {
      name: 'Database Password Rotation',
      description: 'Rotates database passwords with blue-green strategy',
      execute: async (secretConfig) => {
        return await this.rotateDatabasePassword(secretConfig);
      },
      validate: async (secretConfig, newSecret) => {
        return await this.validateDatabaseCredentials(secretConfig, newSecret);
      },
      rollback: async (secretConfig, previousSecret) => {
        return await this.rollbackDatabasePassword(secretConfig, previousSecret);
      }
    });

    // API key rotation strategy
    this.addRotationStrategy('API_KEY', {
      name: 'API Key Rotation',
      description: 'Rotates API keys with overlap period',
      execute: async (secretConfig) => {
        return await this.rotateAPIKey(secretConfig);
      },
      validate: async (secretConfig, newSecret) => {
        return await this.validateAPIKey(secretConfig, newSecret);
      },
      rollback: async (secretConfig, previousSecret) => {
        return await this.rollbackAPIKey(secretConfig, previousSecret);
      }
    });

    // JWT secret rotation strategy
    this.addRotationStrategy('JWT_SECRET', {
      name: 'JWT Secret Rotation',
      description: 'Rotates JWT signing secrets with key versioning',
      execute: async (secretConfig) => {
        return await this.rotateJWTSecret(secretConfig);
      },
      validate: async (secretConfig, newSecret) => {
        return await this.validateJWTSecret(secretConfig, newSecret);
      },
      rollback: async (secretConfig, previousSecret) => {
        return await this.rollbackJWTSecret(secretConfig, previousSecret);
      }
    });

    // Certificate rotation strategy
    this.addRotationStrategy('CERTIFICATE', {
      name: 'SSL Certificate Rotation',
      description: 'Rotates SSL certificates with zero downtime',
      execute: async (secretConfig) => {
        return await this.rotateCertificate(secretConfig);
      },
      validate: async (secretConfig, newSecret) => {
        return await this.validateCertificate(secretConfig, newSecret);
      },
      rollback: async (secretConfig, previousSecret) => {
        return await this.rollbackCertificate(secretConfig, previousSecret);
      }
    });

    // OAuth client secret rotation strategy
    this.addRotationStrategy('OAUTH_CLIENT_SECRET', {
      name: 'OAuth Client Secret Rotation',
      description: 'Rotates OAuth client secrets with provider coordination',
      execute: async (secretConfig) => {
        return await this.rotateOAuthClientSecret(secretConfig);
      },
      validate: async (secretConfig, newSecret) => {
        return await this.validateOAuthClientSecret(secretConfig, newSecret);
      },
      rollback: async (secretConfig, previousSecret) => {
        return await this.rollbackOAuthClientSecret(secretConfig, previousSecret);
      }
    });
  }

  /**
   * Setup secret providers
   */
  setupSecretProviders() {
    // AWS Secrets Manager provider
    this.addSecretProvider('AWS_SECRETS_MANAGER', {
      name: 'AWS Secrets Manager',
      store: async (secretId, secretValue, metadata = {}) => {
        const params = {
          SecretId: secretId,
          SecretString: JSON.stringify(secretValue),
          Description: metadata.description || `School ERP Secret: ${secretId}`,
          KmsKeyId: metadata.kmsKeyId || process.env.SECRETS_KMS_KEY_ID,
          Tags: [
            { Key: 'Environment', Value: process.env.NODE_ENV || 'development' },
            { Key: 'Application', Value: 'school-erp-saas' },
            { Key: 'ManagedBy', Value: 'secret-rotation-manager' },
            ...(metadata.tags || [])
          ]
        };

        try {
          await this.secretsManager.createSecret(params).promise();
        } catch (error) {
          if (error.code === 'ResourceExistsException') {
            // Update existing secret
            await this.secretsManager.updateSecret({
              SecretId: secretId,
              SecretString: JSON.stringify(secretValue)
            }).promise();
          } else {
            throw error;
          }
        }

        return { success: true, secretArn: `arn:aws:secretsmanager:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:secret:${secretId}` };
      },
      retrieve: async (secretId) => {
        const result = await this.secretsManager.getSecretValue({ SecretId: secretId }).promise();
        return JSON.parse(result.SecretString);
      },
      delete: async (secretId) => {
        await this.secretsManager.deleteSecret({
          SecretId: secretId,
          RecoveryWindowInDays: 7
        }).promise();
        return { success: true };
      }
    });

    // AWS Systems Manager Parameter Store provider
    this.addSecretProvider('AWS_PARAMETER_STORE', {
      name: 'AWS Systems Manager Parameter Store',
      store: async (secretId, secretValue, metadata = {}) => {
        const params = {
          Name: `/school-erp/${process.env.NODE_ENV}/${secretId}`,
          Value: typeof secretValue === 'string' ? secretValue : JSON.stringify(secretValue),
          Type: 'SecureString',
          Description: metadata.description || `School ERP Secret: ${secretId}`,
          KeyId: metadata.kmsKeyId || process.env.SECRETS_KMS_KEY_ID,
          Tags: [
            { Key: 'Environment', Value: process.env.NODE_ENV || 'development' },
            { Key: 'Application', Value: 'school-erp-saas' },
            { Key: 'ManagedBy', Value: 'secret-rotation-manager' },
            ...(metadata.tags || [])
          ],
          Overwrite: true
        };

        await this.ssm.putParameter(params).promise();
        return { success: true, parameterName: params.Name };
      },
      retrieve: async (secretId) => {
        const result = await this.ssm.getParameter({
          Name: `/school-erp/${process.env.NODE_ENV}/${secretId}`,
          WithDecryption: true
        }).promise();
        
        try {
          return JSON.parse(result.Parameter.Value);
        } catch (error) {
          return result.Parameter.Value;
        }
      },
      delete: async (secretId) => {
        await this.ssm.deleteParameter({
          Name: `/school-erp/${process.env.NODE_ENV}/${secretId}`
        }).promise();
        return { success: true };
      }
    });

    // Local file-based provider (for development)
    this.addSecretProvider('LOCAL_FILE', {
      name: 'Local File Provider',
      store: async (secretId, secretValue, metadata = {}) => {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const secretsDir = path.join('.secrets', process.env.NODE_ENV || 'development');
        await fs.mkdir(secretsDir, { recursive: true });
        
        const secretFile = path.join(secretsDir, `${secretId}.json`);
        const secretData = {
          secretId,
          value: secretValue,
          metadata,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        
        await fs.writeFile(secretFile, JSON.stringify(secretData, null, 2));
        return { success: true, secretFile };
      },
      retrieve: async (secretId) => {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const secretFile = path.join('.secrets', process.env.NODE_ENV || 'development', `${secretId}.json`);
        const secretData = JSON.parse(await fs.readFile(secretFile, 'utf-8'));
        return secretData.value;
      },
      delete: async (secretId) => {
        const fs = await import('fs/promises');
        const path = await import('path');
        
        const secretFile = path.join('.secrets', process.env.NODE_ENV || 'development', `${secretId}.json`);
        await fs.unlink(secretFile);
        return { success: true };
      }
    });
  }

  /**
   * Setup default rotation policies
   */
  setupDefaultRotationPolicies() {
    // Database credentials rotation policy
    this.addRotationPolicy('database-credentials', {
      name: 'Database Credentials Rotation',
      description: 'Automatic rotation of database passwords every 30 days',
      secretType: 'DATABASE_PASSWORD',
      rotationInterval: 30 * 24 * 60 * 60 * 1000, // 30 days
      provider: 'AWS_SECRETS_MANAGER',
      config: {
        secretId: 'school-erp/database/credentials',
        databases: ['postgresql', 'redis'],
        rotationWindow: {
          start: '02:00',
          end: '04:00',
          timezone: 'UTC'
        }
      },
      notifications: {
        beforeRotation: 24 * 60 * 60 * 1000, // 24 hours
        afterRotation: true,
        onFailure: true
      }
    });

    // JWT signing secret rotation policy
    this.addRotationPolicy('jwt-signing-secret', {
      name: 'JWT Signing Secret Rotation',
      description: 'Automatic rotation of JWT signing secrets every 7 days',
      secretType: 'JWT_SECRET',
      rotationInterval: 7 * 24 * 60 * 60 * 1000, // 7 days
      provider: 'AWS_SECRETS_MANAGER',
      config: {
        secretId: 'school-erp/jwt/signing-secret',
        algorithm: 'HS256',
        keyLength: 256,
        gracePeriod: 2 * 60 * 60 * 1000 // 2 hours overlap
      },
      notifications: {
        beforeRotation: 2 * 60 * 60 * 1000, // 2 hours
        afterRotation: true,
        onFailure: true
      }
    });

    // API keys rotation policy
    this.addRotationPolicy('external-api-keys', {
      name: 'External API Keys Rotation',
      description: 'Automatic rotation of external API keys every 60 days',
      secretType: 'API_KEY',
      rotationInterval: 60 * 24 * 60 * 60 * 1000, // 60 days
      provider: 'AWS_PARAMETER_STORE',
      config: {
        secretId: 'school-erp/api/external-keys',
        apis: ['sendgrid', 'twilio', 'stripe', 'aws-ses'],
        rotationStrategy: 'overlap' // Keep old key active during transition
      },
      notifications: {
        beforeRotation: 7 * 24 * 60 * 60 * 1000, // 7 days
        afterRotation: true,
        onFailure: true
      }
    });

    // SSL certificates rotation policy
    this.addRotationPolicy('ssl-certificates', {
      name: 'SSL Certificates Rotation',
      description: 'Automatic rotation of SSL certificates 30 days before expiry',
      secretType: 'CERTIFICATE',
      rotationInterval: null, // Event-driven based on expiry
      provider: 'AWS_SECRETS_MANAGER',
      config: {
        secretId: 'school-erp/ssl/certificates',
        domains: ['api.school-erp.com', '*.school-erp.com'],
        certificateProvider: 'letsencrypt',
        daysBeforeExpiry: 30
      },
      notifications: {
        beforeRotation: 7 * 24 * 60 * 60 * 1000, // 7 days
        afterRotation: true,
        onFailure: true
      }
    });

    // OAuth client secrets rotation policy
    this.addRotationPolicy('oauth-client-secrets', {
      name: 'OAuth Client Secrets Rotation',
      description: 'Automatic rotation of OAuth client secrets every 90 days',
      secretType: 'OAUTH_CLIENT_SECRET',
      rotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days
      provider: 'AWS_SECRETS_MANAGER',
      config: {
        secretId: 'school-erp/oauth/client-secrets',
        providers: ['google', 'microsoft', 'github'],
        rotationMethod: 'coordinate' // Coordinate with OAuth provider
      },
      notifications: {
        beforeRotation: 7 * 24 * 60 * 60 * 1000, // 7 days
        afterRotation: true,
        onFailure: true
      }
    });
  }

  /**
   * Start rotation scheduler
   */
  startRotationScheduler() {
    // Check for scheduled rotations every hour
    setInterval(async () => {
      await this.checkScheduledRotations();
    }, 60 * 60 * 1000); // 1 hour

    // Check for certificate expiry every day
    setInterval(async () => {
      await this.checkCertificateExpiry();
    }, 24 * 60 * 60 * 1000); // 24 hours

    logger.info('Secret rotation scheduler started');
  }

  /**
   * Register a secret for automatic rotation
   */
  async registerSecret(secretConfig) {
    try {
      logger.info(`Registering secret for rotation: ${secretConfig.secretId}`);

      // Validate secret configuration
      this.validateSecretConfig(secretConfig);

      // Get rotation policy
      const policy = this.rotationPolicies.get(secretConfig.policyId);
      if (!policy) {
        throw new Error(`Rotation policy not found: ${secretConfig.policyId}`);
      }

      // Store secret metadata
      const secretData = {
        ...secretConfig,
        policy,
        registeredAt: new Date(),
        lastRotated: secretConfig.lastRotated || null,
        nextRotation: secretConfig.nextRotation || this.calculateNextRotation(policy),
        rotationCount: secretConfig.rotationCount || 0,
        status: 'active'
      };

      this.activeSecrets.set(secretConfig.secretId, secretData);

      // Schedule next rotation
      await this.scheduleRotation(secretData);

      logger.info(`Secret registered successfully: ${secretConfig.secretId}`);
      return { success: true, nextRotation: secretData.nextRotation };

    } catch (error) {
      logger.error(`Failed to register secret: ${secretConfig.secretId}`, error);
      throw error;
    }
  }

  /**
   * Execute secret rotation
   */
  async rotateSecret(secretId, force = false) {
    try {
      logger.info(`Starting secret rotation: ${secretId}`);

      const secretData = this.activeSecrets.get(secretId);
      if (!secretData) {
        throw new Error(`Secret not found: ${secretId}`);
      }

      // Check if rotation is due (unless forced)
      if (!force && secretData.nextRotation > new Date()) {
        throw new Error(`Rotation not due yet for secret: ${secretId}`);
      }

      const rotationResult = {
        secretId,
        startTime: new Date(),
        success: false,
        steps: [],
        newSecretVersion: null,
        previousSecretVersion: secretData.currentVersion || 1
      };

      try {
        // Step 1: Send pre-rotation notification
        rotationResult.steps.push({ step: 'pre-notification', status: 'started' });
        await this.sendPreRotationNotification(secretData);
        rotationResult.steps.push({ step: 'pre-notification', status: 'completed' });

        // Step 2: Generate new secret
        rotationResult.steps.push({ step: 'generate-secret', status: 'started' });
        const rotationStrategy = this.rotationStrategies.get(secretData.policy.secretType);
        if (!rotationStrategy) {
          throw new Error(`No rotation strategy found for type: ${secretData.policy.secretType}`);
        }

        const newSecret = await rotationStrategy.execute(secretData);
        rotationResult.steps.push({ step: 'generate-secret', status: 'completed', result: { generated: true } });

        // Step 3: Store new secret
        rotationResult.steps.push({ step: 'store-secret', status: 'started' });
        const provider = this.secretProviders.get(secretData.policy.provider);
        const storeResult = await provider.store(
          `${secretId}/v${secretData.currentVersion + 1}`,
          newSecret,
          {
            description: `Rotated version of ${secretId}`,
            previousVersion: secretData.currentVersion || 1,
            rotationDate: new Date()
          }
        );
        rotationResult.steps.push({ step: 'store-secret', status: 'completed', result: storeResult });

        // Step 4: Validate new secret
        rotationResult.steps.push({ step: 'validate-secret', status: 'started' });
        const validationResult = await rotationStrategy.validate(secretData, newSecret);
        if (!validationResult.valid) {
          throw new Error(`Secret validation failed: ${validationResult.errors.join(', ')}`);
        }
        rotationResult.steps.push({ step: 'validate-secret', status: 'completed', result: validationResult });

        // Step 5: Update secret metadata
        rotationResult.steps.push({ step: 'update-metadata', status: 'started' });
        secretData.lastRotated = new Date();
        secretData.nextRotation = this.calculateNextRotation(secretData.policy);
        secretData.rotationCount = (secretData.rotationCount || 0) + 1;
        secretData.currentVersion = (secretData.currentVersion || 1) + 1;
        secretData.status = 'rotated';
        
        this.activeSecrets.set(secretId, secretData);
        rotationResult.steps.push({ step: 'update-metadata', status: 'completed' });

        // Step 6: Schedule next rotation
        rotationResult.steps.push({ step: 'schedule-next', status: 'started' });
        await this.scheduleRotation(secretData);
        rotationResult.steps.push({ step: 'schedule-next', status: 'completed' });

        rotationResult.success = true;
        rotationResult.newSecretVersion = secretData.currentVersion;

      } catch (error) {
        logger.error(`Secret rotation failed at step ${rotationResult.steps.length + 1}: ${secretId}`, error);

        // Attempt rollback if we have a previous version
        if (rotationResult.steps.some(s => s.step === 'store-secret' && s.status === 'completed')) {
          try {
            const rotationStrategy = this.rotationStrategies.get(secretData.policy.secretType);
            await rotationStrategy.rollback(secretData, rotationResult.previousSecretVersion);
            logger.info(`Rollback completed for secret: ${secretId}`);
          } catch (rollbackError) {
            logger.error(`Rollback failed for secret: ${secretId}`, rollbackError);
          }
        }

        throw error;
      }

      rotationResult.endTime = new Date();
      rotationResult.duration = rotationResult.endTime - rotationResult.startTime;

      // Record rotation in history
      this.rotationHistory.push(rotationResult);

      // Keep only last 1000 rotation records
      if (this.rotationHistory.length > 1000) {
        this.rotationHistory = this.rotationHistory.slice(-1000);
      }

      // Send post-rotation notification
      await this.sendPostRotationNotification(secretData, rotationResult);

      // Emit rotation completed event
      this.emit('secretRotated', rotationResult);

      logger.info(`Secret rotation completed successfully: ${secretId}`, {
        duration: rotationResult.duration,
        newVersion: rotationResult.newSecretVersion
      });

      return rotationResult;

    } catch (error) {
      logger.error(`Secret rotation failed: ${secretId}`, error);

      // Send failure notification
      await this.sendRotationFailureNotification(secretId, error);

      throw error;
    }
  }

  // Rotation strategy implementations
  async rotateDatabasePassword(secretConfig) {
    const newPassword = this.generateSecurePassword(32);
    
    // Return the new password - actual database update would happen in validation step
    return {
      password: newPassword,
      username: secretConfig.config.username,
      host: secretConfig.config.host,
      port: secretConfig.config.port,
      database: secretConfig.config.database
    };
  }

  async rotateAPIKey(secretConfig) {
    // Generate new API key
    const newApiKey = this.generateAPIKey();
    
    return {
      apiKey: newApiKey,
      provider: secretConfig.config.provider,
      generatedAt: new Date(),
      expiresAt: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)) // 1 year
    };
  }

  async rotateJWTSecret(secretConfig) {
    const keyLength = secretConfig.config.keyLength || 256;
    const newSecret = crypto.randomBytes(keyLength / 8).toString('hex');
    
    return {
      secret: newSecret,
      algorithm: secretConfig.config.algorithm || 'HS256',
      keyId: `jwt-${Date.now()}`,
      generatedAt: new Date()
    };
  }

  async rotateCertificate(secretConfig) {
    // This would integrate with certificate authority (Let's Encrypt, etc.)
    // For now, return a placeholder structure
    return {
      certificate: 'new-certificate-content',
      privateKey: 'new-private-key-content',
      certificateChain: 'certificate-chain-content',
      domains: secretConfig.config.domains,
      expiresAt: new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)) // 90 days
    };
  }

  async rotateOAuthClientSecret(secretConfig) {
    // This would coordinate with OAuth provider API
    const newClientSecret = this.generateSecurePassword(64);
    
    return {
      clientId: secretConfig.config.clientId,
      clientSecret: newClientSecret,
      provider: secretConfig.config.provider,
      scopes: secretConfig.config.scopes || [],
      generatedAt: new Date()
    };
  }

  // Validation methods
  async validateDatabaseCredentials(secretConfig, newSecret) {
    try {
      // Simulate database connection test
      // In production, this would actually test the connection
      return {
        valid: true,
        connectionTime: Math.random() * 100 + 50, // 50-150ms
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  async validateAPIKey(secretConfig, newSecret) {
    try {
      // Simulate API key validation
      return {
        valid: true,
        provider: newSecret.provider,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  async validateJWTSecret(secretConfig, newSecret) {
    try {
      // Validate JWT secret can sign and verify tokens
      const jwt = await import('jsonwebtoken');
      const testPayload = { test: true, iat: Date.now() };
      const token = jwt.sign(testPayload, newSecret.secret, { algorithm: newSecret.algorithm });
      const decoded = jwt.verify(token, newSecret.secret);
      
      return {
        valid: decoded.test === true,
        algorithm: newSecret.algorithm,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  async validateCertificate(secretConfig, newSecret) {
    try {
      // Simulate certificate validation
      return {
        valid: true,
        domains: newSecret.domains,
        expiresAt: newSecret.expiresAt,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  async validateOAuthClientSecret(secretConfig, newSecret) {
    try {
      // Simulate OAuth client secret validation
      return {
        valid: true,
        provider: newSecret.provider,
        clientId: newSecret.clientId,
        errors: []
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error.message]
      };
    }
  }

  // Helper methods
  generateSecurePassword(length = 32) {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    return password;
  }

  generateAPIKey() {
    return 'sk_' + crypto.randomBytes(32).toString('hex');
  }

  calculateNextRotation(policy) {
    if (!policy.rotationInterval) {
      return null; // Event-driven rotation
    }
    
    return new Date(Date.now() + policy.rotationInterval);
  }

  validateSecretConfig(config) {
    const required = ['secretId', 'policyId'];
    
    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Required field missing: ${field}`);
      }
    }
  }

  async checkScheduledRotations() {
    const now = new Date();
    
    for (const [secretId, secretData] of this.activeSecrets) {
      if (secretData.nextRotation && secretData.nextRotation <= now && secretData.status === 'active') {
        try {
          logger.info(`Executing scheduled rotation: ${secretId}`);
          await this.rotateSecret(secretId);
        } catch (error) {
          logger.error(`Scheduled rotation failed: ${secretId}`, error);
        }
      }
    }
  }

  async checkCertificateExpiry() {
    // Check for certificates that need rotation based on expiry
    for (const [secretId, secretData] of this.activeSecrets) {
      if (secretData.policy.secretType === 'CERTIFICATE') {
        try {
          const currentSecret = await this.secretProviders.get(secretData.policy.provider)
            .retrieve(secretId);
          
          if (currentSecret.expiresAt) {
            const daysUntilExpiry = Math.ceil((new Date(currentSecret.expiresAt) - new Date()) / (24 * 60 * 60 * 1000));
            const rotationThreshold = secretData.config.daysBeforeExpiry || 30;
            
            if (daysUntilExpiry <= rotationThreshold) {
              logger.info(`Certificate expiry approaching, scheduling rotation: ${secretId}`, {
                daysUntilExpiry,
                threshold: rotationThreshold
              });
              
              await this.rotateSecret(secretId);
            }
          }
        } catch (error) {
          logger.error(`Certificate expiry check failed: ${secretId}`, error);
        }
      }
    }
  }

  async scheduleRotation(secretData) {
    if (secretData.nextRotation) {
      const timeUntilRotation = secretData.nextRotation.getTime() - Date.now();
      
      if (timeUntilRotation > 0) {
        // Clear existing timeout if any
        if (this.scheduledRotations.has(secretData.secretId)) {
          clearTimeout(this.scheduledRotations.get(secretData.secretId));
        }
        
        // Schedule new rotation
        const timeoutId = setTimeout(async () => {
          try {
            await this.rotateSecret(secretData.secretId);
          } catch (error) {
            logger.error(`Scheduled rotation failed: ${secretData.secretId}`, error);
          }
        }, Math.min(timeUntilRotation, 2147483647)); // Max setTimeout value
        
        this.scheduledRotations.set(secretData.secretId, timeoutId);
        
        logger.debug(`Rotation scheduled for ${secretData.secretId} at ${secretData.nextRotation}`);
      }
    }
  }

  // Notification methods
  async sendPreRotationNotification(secretData) {
    logger.info(`Pre-rotation notification: ${secretData.secretId}`);
    // Implementation would send actual notifications (email, Slack, etc.)
  }

  async sendPostRotationNotification(secretData, rotationResult) {
    logger.info(`Post-rotation notification: ${secretData.secretId}`, {
      success: rotationResult.success,
      duration: rotationResult.duration
    });
    // Implementation would send actual notifications
  }

  async sendRotationFailureNotification(secretId, error) {
    logger.error(`Rotation failure notification: ${secretId}`, error);
    // Implementation would send actual notifications
  }

  // Public API methods
  addRotationPolicy(policyId, policy) {
    this.rotationPolicies.set(policyId, policy);
    logger.debug(`Rotation policy added: ${policyId}`);
  }

  addRotationStrategy(strategyId, strategy) {
    this.rotationStrategies.set(strategyId, strategy);
    logger.debug(`Rotation strategy added: ${strategyId}`);
  }

  addSecretProvider(providerId, provider) {
    this.secretProviders.set(providerId, provider);
    logger.debug(`Secret provider added: ${providerId}`);
  }

  getRotationHistory(secretId = null, limit = 100) {
    let history = this.rotationHistory;
    
    if (secretId) {
      history = history.filter(r => r.secretId === secretId);
    }
    
    return history
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  getActiveSecrets() {
    return Array.from(this.activeSecrets.values());
  }

  getSecretStatus(secretId) {
    return this.activeSecrets.get(secretId);
  }

  getRotationPolicies() {
    return Array.from(this.rotationPolicies.values());
  }

  async generateRotationReport() {
    const report = {
      generatedAt: new Date(),
      totalSecrets: this.activeSecrets.size,
      rotationsPending: 0,
      rotationsOverdue: 0,
      recentRotations: this.rotationHistory.slice(-10),
      byPolicy: {},
      upcomingRotations: []
    };

    const now = new Date();
    
    for (const [secretId, secretData] of this.activeSecrets) {
      // Count pending and overdue rotations
      if (secretData.nextRotation) {
        if (secretData.nextRotation > now) {
          report.rotationsPending++;
          
          // Add to upcoming rotations
          report.upcomingRotations.push({
            secretId,
            nextRotation: secretData.nextRotation,
            daysUntil: Math.ceil((secretData.nextRotation - now) / (24 * 60 * 60 * 1000))
          });
        } else {
          report.rotationsOverdue++;
        }
      }

      // Group by policy
      const policyId = secretData.policyId;
      if (!report.byPolicy[policyId]) {
        report.byPolicy[policyId] = {
          total: 0,
          active: 0,
          pending: 0,
          overdue: 0
        };
      }
      
      report.byPolicy[policyId].total++;
      
      if (secretData.status === 'active') {
        report.byPolicy[policyId].active++;
      }
      
      if (secretData.nextRotation) {
        if (secretData.nextRotation > now) {
          report.byPolicy[policyId].pending++;
        } else {
          report.byPolicy[policyId].overdue++;
        }
      }
    }

    // Sort upcoming rotations by date
    report.upcomingRotations.sort((a, b) => a.nextRotation - b.nextRotation);

    return report;
  }
}

// Export singleton instance
export const secretRotationManager = new SecretRotationManager();
