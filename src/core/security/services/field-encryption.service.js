// src/core/security/services/field-encryption.service.js
import crypto from 'crypto';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';

/**
 * Field-Level Encryption Service for Sensitive Data
 * Encrypts/decrypts individual database fields
 */
export class FieldEncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.saltLength = 64;
    this.tagLength = 16;
    this.iterations = 100000;
    
    // Get encryption key from environment or AWS KMS
    this.masterKey = this.getMasterKey();
  }

  /**
   * Encrypt sensitive field data
   */
  encryptField(plaintext, fieldName, userId = null) {
    try {
      if (!plaintext || typeof plaintext !== 'string') {
        return plaintext;
      }

      // Generate random IV and salt
      const iv = crypto.randomBytes(this.ivLength);
      const salt = crypto.randomBytes(this.saltLength);
      
      // Derive field-specific key using PBKDF2
      const derivedKey = crypto.pbkdf2Sync(
        this.masterKey,
        Buffer.concat([salt, Buffer.from(fieldName + (userId || ''))]),
        this.iterations,
        this.keyLength,
        'sha512'
      );

      // Create cipher
      const cipher = crypto.createCipher(this.algorithm, derivedKey, iv);
      
      // Encrypt data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Combine all components
      const encryptedData = {
        encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm,
        version: '1.0'
      };

      return JSON.stringify(encryptedData);
    } catch (error) {
      logger.error('Field encryption failed:', {
        error: error.message,
        fieldName,
        userId
      });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt sensitive field data
   */
  decryptField(encryptedData, fieldName, userId = null) {
    try {
      if (!encryptedData || typeof encryptedData !== 'string') {
        return encryptedData;
      }

      // Parse encrypted data
      const data = JSON.parse(encryptedData);
      const { encrypted, iv, salt, authTag, algorithm } = data;

      // Derive the same key
      const derivedKey = crypto.pbkdf2Sync(
        this.masterKey,
        Buffer.concat([
          Buffer.from(salt, 'hex'),
          Buffer.from(fieldName + (userId || ''))
        ]),
        this.iterations,
        this.keyLength,
        'sha512'
      );

      // Create decipher
      const decipher = crypto.createDecipher(
        algorithm,
        derivedKey,
        Buffer.from(iv, 'hex')
      );
      
      // Set auth tag
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      // Decrypt
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Field decryption failed:', {
        error: error.message,
        fieldName,
        userId
      });
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt multiple fields in an object
   */
  encryptObject(obj, fieldsToEncrypt, userId = null) {
    const encrypted = { ...obj };
    
    for (const field of fieldsToEncrypt) {
      if (obj[field] !== undefined) {
        encrypted[field] = this.encryptField(obj[field], field, userId);
      }
    }
    
    return encrypted;
  }

  /**
   * Decrypt multiple fields in an object
   */
  decryptObject(obj, fieldsToDecrypt, userId = null) {
    const decrypted = { ...obj };
    
    for (const field of fieldsToDecrypt) {
      if (obj[field] !== undefined) {
        try {
          decrypted[field] = this.decryptField(obj[field], field, userId);
        } catch (error) {
          logger.warn(`Failed to decrypt field ${field}:`, error.message);
          decrypted[field] = '[ENCRYPTED]';
        }
      }
    }
    
    return decrypted;
  }

  /**
   * Get master encryption key from environment or AWS KMS
   */
  getMasterKey() {
    // Try environment variable first
    if (process.env.FIELD_ENCRYPTION_KEY) {
      return Buffer.from(process.env.FIELD_ENCRYPTION_KEY, 'hex');
    }

    // Fallback to derived key from JWT secret (not recommended for production)
    if (baseConfig.jwt.accessSecret) {
      return crypto.pbkdf2Sync(
        baseConfig.jwt.accessSecret,
        'field-encryption-salt',
        100000,
        32,
        'sha512'
      );
    }

    throw new Error('No encryption key available');
  }

  /**
   * Generate search hash for encrypted fields (for searching)
   */
  generateSearchHash(plaintext, fieldName) {
    const searchSalt = crypto.pbkdf2Sync(
      this.masterKey,
      'search-' + fieldName,
      50000,
      32,
      'sha256'
    );
    
    return crypto.pbkdf2Sync(
      plaintext.toLowerCase().trim(),
      searchSalt,
      10000,
      32,
      'sha256'
    ).toString('hex');
  }
}

// Export singleton instance
export const fieldEncryption = new FieldEncryptionService();
