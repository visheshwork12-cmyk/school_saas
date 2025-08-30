// src/infrastructure/security/encryption.js - Comprehensive encryption utilities
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { promisify } from 'util';
import appConfig from '#shared/config/app.config.js';
import { logger } from '#utils/core/logger.js';

const randomBytes = promisify(crypto.randomBytes);
const scrypt = promisify(crypto.scrypt);

/**
 * Comprehensive Encryption Service
 * Provides secure encryption, hashing, and key management utilities
 */
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16; // 128 bits
    this.tagLength = 16; // 128 bits
    this.saltLength = 32; // 256 bits
    
    // Initialize encryption keys
    this.initializeKeys();
  }

  initializeKeys() {
    this.masterKey = process.env.MASTER_ENCRYPTION_KEY || this.generateSecureKey();
    this.dataEncryptionKey = process.env.DATA_ENCRYPTION_KEY || this.generateSecureKey();
    this.tokenSigningKey = process.env.TOKEN_SIGNING_KEY || this.generateSecureKey();
    
    if (appConfig.isProduction() && !process.env.MASTER_ENCRYPTION_KEY) {
      throw new Error('MASTER_ENCRYPTION_KEY environment variable is required in production');
    }
  }

  /**
   * Generate a cryptographically secure random key
   */
  generateSecureKey(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Hash password using bcrypt with salt
   */
  async hashPassword(password) {
    try {
      const saltRounds = appConfig.get('auth.password.saltRounds') || 12;
      return await bcrypt.hash(password, saltRounds);
    } catch (error) {
      logger.error('Password hashing failed:', error);
      throw new Error('Password hashing failed');
    }
  }

  /**
   * Verify password against hash
   */
  async verifyPassword(password, hash) {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password verification failed:', error);
      throw new Error('Password verification failed');
    }
  }

  /**
   * Derive key from password using scrypt
   */
  async deriveKeyFromPassword(password, salt, keyLength = 32) {
    try {
      return await scrypt(password, salt, keyLength);
    } catch (error) {
      logger.error('Key derivation failed:', error);
      throw new Error('Key derivation failed');
    }
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  async encrypt(plaintext, key = null) {
    try {
      const encryptionKey = key ? Buffer.from(key, 'hex') : Buffer.from(this.dataEncryptionKey, 'hex');
      const iv = await randomBytes(this.ivLength);
      
      const cipher = crypto.createCipher(this.algorithm, encryptionKey, iv);
      
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine IV, tag, and encrypted data
      const result = {
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        encrypted,
        algorithm: this.algorithm
      };
      
      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data using AES-256-GCM
   */
  async decrypt(encryptedData, key = null) {
    try {
      const decryptionKey = key ? Buffer.from(key, 'hex') : Buffer.from(this.dataEncryptionKey, 'hex');
      const data = JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
      
      const decipher = crypto.createDecipher(data.algorithm, decryptionKey, Buffer.from(data.iv, 'hex'));
      decipher.setAuthTag(Buffer.from(data.tag, 'hex'));
      
      let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt sensitive data fields in object
   */
  async encryptSensitiveFields(data, sensitiveFields = []) {
    const encryptedData = { ...data };
    
    for (const field of sensitiveFields) {
      if (encryptedData[field]) {
        encryptedData[field] = await this.encrypt(encryptedData[field].toString());
        encryptedData[`${field}_encrypted`] = true;
      }
    }
    
    return encryptedData;
  }

  /**
   * Decrypt sensitive data fields in object
   */
  async decryptSensitiveFields(data, sensitiveFields = []) {
    const decryptedData = { ...data };
    
    for (const field of sensitiveFields) {
      if (decryptedData[field] && decryptedData[`${field}_encrypted`]) {
        decryptedData[field] = await this.decrypt(decryptedData[field]);
        delete decryptedData[`${field}_encrypted`];
      }
    }
    
    return decryptedData;
  }

  /**
   * Generate HMAC signature
   */
  generateHMAC(data, key = null) {
    const signingKey = key || this.tokenSigningKey;
    return crypto.createHmac('sha256', signingKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Verify HMAC signature
   */
  verifyHMAC(data, signature, key = null) {
    const expectedSignature = this.generateHMAC(data, key);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Create cryptographically secure hash
   */
  createHash(data, algorithm = 'sha256') {
    return crypto.createHash(algorithm)
      .update(data)
      .digest('hex');
  }

  /**
   * Generate secure one-time password (OTP)
   */
  generateOTP(length = 6) {
    const digits = '0123456789';
    let otp = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, digits.length);
      otp += digits[randomIndex];
    }
    
    return otp;
  }

  /**
   * Generate secure API key
   */
  generateAPIKey(prefix = 'sk', length = 32) {
    const key = crypto.randomBytes(length).toString('base64url');
    return `${prefix}_${key}`;
  }

  /**
   * Encrypt data with time-based expiration
   */
  async encryptWithExpiration(data, ttlSeconds = 3600) {
    const payload = {
      data,
      exp: Math.floor(Date.now() / 1000) + ttlSeconds,
      iat: Math.floor(Date.now() / 1000)
    };
    
    return await this.encrypt(JSON.stringify(payload));
  }

  /**
   * Decrypt and verify expiration
   */
  async decryptWithExpiration(encryptedData) {
    try {
      const decrypted = await this.decrypt(encryptedData);
      const payload = JSON.parse(decrypted);
      
      const currentTime = Math.floor(Date.now() / 1000);
      
      if (currentTime > payload.exp) {
        throw new Error('Data has expired');
      }
      
      return payload.data;
    } catch (error) {
      logger.error('Decryption with expiration failed:', error);
      throw new Error('Invalid or expired data');
    }
  }

  /**
   * Secure data masking for logging
   */
  maskSensitiveData(data, fields = ['password', 'token', 'key', 'secret']) {
    const masked = { ...data };
    
    const maskValue = (value) => {
      if (typeof value === 'string') {
        if (value.length <= 4) {return '*'.repeat(value.length);}
        return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
      }
      return '***';
    };
    
    const maskObject = (obj) => {
      for (const [key, value] of Object.entries(obj)) {
        if (fields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          obj[key] = maskValue(value);
        } else if (typeof value === 'object' && value !== null) {
          maskObject(value);
        }
      }
    };
    
    maskObject(masked);
    return masked;
  }

  /**
   * Generate digital fingerprint for data integrity
   */
  generateFingerprint(data) {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    return this.createHash(serialized, 'sha256');
  }

  /**
   * Verify data integrity using fingerprint
   */
  verifyFingerprint(data, expectedFingerprint) {
    const actualFingerprint = this.generateFingerprint(data);
    return crypto.timingSafeEqual(
      Buffer.from(actualFingerprint, 'hex'),
      Buffer.from(expectedFingerprint, 'hex')
    );
  }

  /**
   * Secure random string generation
   */
  generateSecureRandomString(length = 16, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
    let result = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      result += charset[randomIndex];
    }
    
    return result;
  }

  /**
   * Generate cryptographically secure UUID
   */
  generateSecureUUID() {
    return crypto.randomUUID();
  }

  /**
   * Key rotation utility
   */
  async rotateEncryptionKey(oldData, oldKey, newKey) {
    try {
      const decrypted = await this.decrypt(oldData, oldKey);
      return await this.encrypt(decrypted, newKey);
    } catch (error) {
      logger.error('Key rotation failed:', error);
      throw new Error('Key rotation failed');
    }
  }

  /**
   * Secure comparison to prevent timing attacks
   */
  secureCompare(a, b) {
    if (a.length !== b.length) {
      return false;
    }
    
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Get encryption service health status
   */
  getHealthStatus() {
    return {
      algorithm: this.algorithm,
      keyLength: this.keyLength,
      ivLength: this.ivLength,
      tagLength: this.tagLength,
      masterKeyConfigured: !!this.masterKey,
      dataEncryptionKeyConfigured: !!this.dataEncryptionKey,
      tokenSigningKeyConfigured: !!this.tokenSigningKey
    };
  }
}

// Export singleton instance
const encryptionService = new EncryptionService();

// Utility exports
export const encrypt = (data, key) => encryptionService.encrypt(data, key);
export const decrypt = (data, key) => encryptionService.decrypt(data, key);
export const hashPassword = (password) => encryptionService.hashPassword(password);
export const verifyPassword = (password, hash) => encryptionService.verifyPassword(password, hash);
export const generateSecureToken = (length) => encryptionService.generateSecureToken(length);
export const generateOTP = (length) => encryptionService.generateOTP(length);
export const generateAPIKey = (prefix, length) => encryptionService.generateAPIKey(prefix, length);
export const createHash = (data, algorithm) => encryptionService.createHash(data, algorithm);
export const generateHMAC = (data, key) => encryptionService.generateHMAC(data, key);
export const verifyHMAC = (data, signature, key) => encryptionService.verifyHMAC(data, signature, key);
export const maskSensitiveData = (data, fields) => encryptionService.maskSensitiveData(data, fields);
export const generateFingerprint = (data) => encryptionService.generateFingerprint(data);
export const verifyFingerprint = (data, fingerprint) => encryptionService.verifyFingerprint(data, fingerprint);

export default encryptionService;
