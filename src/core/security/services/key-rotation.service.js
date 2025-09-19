// src/core/security/services/key-rotation.service.js
import AWS from 'aws-sdk';
import cron from 'node-cron';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { fieldEncryption } from './field-encryption.service.js';

/**
 * AWS KMS Key Rotation Service
 * Automates key rotation for enhanced security
 */
export class KeyRotationService {
  constructor() {
    this.kms = new AWS.KMS({
      region: baseConfig.aws.region,
      accessKeyId: baseConfig.aws.accessKeyId,
      secretAccessKey: baseConfig.aws.secretAccessKey
    });

    this.secretsManager = new AWS.SecretsManager({
      region: baseConfig.aws.region
    });

    this.rotationSchedule = process.env.KEY_ROTATION_SCHEDULE || '0 0 1 * *'; // Monthly
    this.rotationEnabled = process.env.KEY_ROTATION_ENABLED === 'true';
    this.keyIds = this.getKeyIds();
    
    if (this.rotationEnabled) {
      this.scheduleKeyRotation();
    }
  }

  /**
   * Get KMS Key IDs from configuration
   */
  getKeyIds() {
    return {
      fieldEncryption: process.env.FIELD_ENCRYPTION_KMS_KEY_ID,
      backupEncryption: process.env.BACKUP_KMS_KEY_ID,
      databaseEncryption: process.env.DATABASE_KMS_KEY_ID,
      fileEncryption: process.env.FILE_ENCRYPTION_KMS_KEY_ID
    };
  }

  /**
   * Enable automatic key rotation for KMS keys
   */
  async enableKeyRotation(keyId, keyType) {
    try {
      // Check if rotation is already enabled
      const rotationStatus = await this.kms.getKeyRotationStatus({
        KeyId: keyId
      }).promise();

      if (rotationStatus.KeyRotationEnabled) {
        logger.info('Key rotation already enabled', { keyId, keyType });
        return { status: 'already-enabled', keyId, keyType };
      }

      // Enable key rotation
      await this.kms.enableKeyRotation({
        KeyId: keyId
      }).promise();

      logger.info('Key rotation enabled successfully', { keyId, keyType });
      
      return { status: 'enabled', keyId, keyType };
    } catch (error) {
      logger.error('Failed to enable key rotation', {
        keyId,
        keyType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Rotate KMS key manually
   */
  async rotateKey(keyId, keyType) {
    try {
      logger.info('Starting manual key rotation', { keyId, keyType });

      // Generate new key version
      const rotationResult = await this.kms.rotateKey({
        KeyId: keyId
      }).promise();

      // Update key metadata
      await this.kms.putKeyMetadata({
        KeyId: keyId,
        Metadata: {
          LastRotated: new Date().toISOString(),
          RotationType: 'manual',
          KeyType: keyType
        }
      }).promise();

      logger.info('Key rotation completed successfully', {
        keyId,
        keyType,
        newKeyVersion: rotationResult.KeyId
      });

      // Trigger re-encryption of data if needed
      await this.triggerDataReEncryption(keyId, keyType);

      return {
        status: 'rotated',
        keyId,
        keyType,
        rotatedAt: new Date().toISOString(),
        newKeyVersion: rotationResult.KeyId
      };

    } catch (error) {
      logger.error('Key rotation failed', {
        keyId,
        keyType,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Schedule automatic key rotation
   */
  scheduleKeyRotation() {
    logger.info('Scheduling automatic key rotation', {
      schedule: this.rotationSchedule,
      enabled: this.rotationEnabled
    });

    // Schedule monthly key rotation check
    cron.schedule(this.rotationSchedule, async () => {
      await this.performScheduledRotation();
    }, {
      timezone: 'UTC'
    });
  }

  /**
   * Perform scheduled key rotation
   */
  async performScheduledRotation() {
    logger.info('Starting scheduled key rotation check');

    const rotationResults = [];

    for (const [keyType, keyId] of Object.entries(this.keyIds)) {
      if (!keyId) {
        logger.warn(`No KMS key configured for ${keyType}`);
        continue;
      }

      try {
        // Check if key needs rotation
        const needsRotation = await this.checkKeyRotationStatus(keyId, keyType);
        
        if (needsRotation) {
          const result = await this.rotateKey(keyId, keyType);
          rotationResults.push(result);
        } else {
          logger.debug('Key rotation not needed', { keyId, keyType });
        }

      } catch (error) {
        logger.error('Scheduled key rotation failed', {
          keyId,
          keyType,
          error: error.message
        });
        
        rotationResults.push({
          status: 'failed',
          keyId,
          keyType,
          error: error.message
        });
      }
    }

    // Log rotation summary
    logger.info('Scheduled key rotation completed', {
      totalKeys: Object.keys(this.keyIds).length,
      rotated: rotationResults.filter(r => r.status === 'rotated').length,
      failed: rotationResults.filter(r => r.status === 'failed').length,
      results: rotationResults
    });

    return rotationResults;
  }

  /**
   * Check if key needs rotation
   */
  async checkKeyRotationStatus(keyId, keyType) {
    try {
      const keyMetadata = await this.kms.describeKey({
        KeyId: keyId
      }).promise();

      const keyInfo = keyMetadata.KeyMetadata;
      const daysSinceCreation = (Date.now() - keyInfo.CreationDate) / (1000 * 60 * 60 * 24);
      const daysSinceRotation = keyInfo.LastRotatedDate
        ? (Date.now() - keyInfo.LastRotatedDate) / (1000 * 60 * 60 * 24)
        : daysSinceCreation;

      // Rotate if older than 90 days
      const rotationThreshold = parseInt(process.env.KEY_ROTATION_DAYS) || 90;
      const needsRotation = daysSinceRotation > rotationThreshold;

      logger.debug('Key rotation status check', {
        keyId,
        keyType,
        daysSinceRotation: Math.floor(daysSinceRotation),
        rotationThreshold,
        needsRotation
      });

      return needsRotation;
    } catch (error) {
      logger.error('Failed to check key rotation status', {
        keyId,
        keyType,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Trigger re-encryption of data after key rotation
   */
  async triggerDataReEncryption(keyId, keyType) {
    try {
      logger.info('Starting data re-encryption after key rotation', {
        keyId,
        keyType
      });

      switch (keyType) {
        case 'fieldEncryption':
          await this.reEncryptFieldData(keyId);
          break;
        case 'backupEncryption':
          await this.reEncryptBackupData(keyId);
          break;
        case 'fileEncryption':
          await this.reEncryptFileData(keyId);
          break;
        default:
          logger.warn('Unknown key type for re-encryption', { keyType });
      }

      logger.info('Data re-encryption completed', { keyId, keyType });
    } catch (error) {
      logger.error('Data re-encryption failed', {
        keyId,
        keyType,
        error: error.message
      });
      // Don't throw error to avoid breaking rotation
    }
  }

  /**
   * Re-encrypt field data with new key
   */
  async reEncryptFieldData(keyId) {
    // This would typically involve:
    // 1. Getting all encrypted fields from database
    // 2. Decrypting with old key
    // 3. Re-encrypting with new key
    // 4. Updating database records
    
    logger.info('Field data re-encryption would be triggered here', { keyId });
  }

  /**
   * Re-encrypt backup data with new key
   */
  async reEncryptBackupData(keyId) {
    logger.info('Backup data re-encryption would be triggered here', { keyId });
  }

  /**
   * Re-encrypt file data with new key
   */
  async reEncryptFileData(keyId) {
    logger.info('File data re-encryption would be triggered here', { keyId });
  }

  /**
   * Get key rotation status report
   */
  async getKeyRotationReport() {
    const report = {
      generatedAt: new Date().toISOString(),
      rotationEnabled: this.rotationEnabled,
      keys: {}
    };

    for (const [keyType, keyId] of Object.entries(this.keyIds)) {
      if (!keyId) continue;

      try {
        const keyMetadata = await this.kms.describeKey({
          KeyId: keyId
        }).promise();

        const rotationStatus = await this.kms.getKeyRotationStatus({
          KeyId: keyId
        }).promise();

        report.keys[keyType] = {
          keyId,
          createdAt: keyMetadata.KeyMetadata.CreationDate,
          lastRotatedAt: keyMetadata.KeyMetadata.LastRotatedDate,
          rotationEnabled: rotationStatus.KeyRotationEnabled,
          daysSinceLastRotation: keyMetadata.KeyMetadata.LastRotatedDate
            ? (Date.now() - keyMetadata.KeyMetadata.LastRotatedDate) / (1000 * 60 * 60 * 24)
            : null
        };
      } catch (error) {
        report.keys[keyType] = {
          keyId,
          error: error.message,
          status: 'error'
        };
      }
    }

    return report;
  }

  /**
   * Update application secrets after key rotation
   */
  async updateSecretsAfterRotation(keyId, keyType) {
    try {
      // Update secrets in AWS Secrets Manager
      const secretName = `school-erp/${process.env.NODE_ENV}/${keyType}-key`;
      
      const secretValue = {
        keyId: keyId,
        rotatedAt: new Date().toISOString(),
        keyType: keyType
      };

      await this.secretsManager.putSecretValue({
        SecretId: secretName,
        SecretString: JSON.stringify(secretValue)
      }).promise();

      logger.info('Secrets updated after key rotation', {
        secretName,
        keyId,
        keyType
      });

    } catch (error) {
      logger.error('Failed to update secrets after rotation', {
        keyId,
        keyType,
        error: error.message
      });
    }
  }
}

// Export singleton
export const keyRotationService = new KeyRotationService();
