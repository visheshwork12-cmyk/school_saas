// src/core/audit/services/integrity-protected-audit.service.js
import crypto from "crypto";
import { logger } from "#utils/core/logger.js";
import { BaseException } from "#shared/exceptions/base.exception.js";
import mongoose from "mongoose";

/**
 * Integrity Protected Audit Log Service
 * Ensures audit logs cannot be tampered with
 */
export class IntegrityProtectedAuditService {
  constructor() {
    this.hashChain = null;
    this.secretKey = process.env.AUDIT_INTEGRITY_KEY || this.generateSecretKey();
    this.initializeHashChain();
  }

  /**
   * Generate secret key for HMAC
   */
  generateSecretKey() {
    const key = crypto.randomBytes(32).toString('hex');
    logger.warn('Generated new audit integrity key. Store this securely!', { key });
    return key;
  }

  /**
   * Initialize hash chain for audit log integrity
   */
  async initializeHashChain() {
    try {
      // Get the last audit log entry to continue the chain
      const lastEntry = await this.getLastAuditEntry();
      
      if (lastEntry && lastEntry.integrityHash) {
        this.hashChain = lastEntry.integrityHash;
        logger.info('Hash chain initialized from last audit entry');
      } else {
        // Start new hash chain
        this.hashChain = this.generateGenesisHash();
        logger.info('New hash chain initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize hash chain:', error);
      this.hashChain = this.generateGenesisHash();
    }
  }

  /**
   * Generate genesis hash for new chain
   */
  generateGenesisHash() {
    const genesisData = {
      timestamp: new Date().toISOString(),
      message: 'GENESIS_BLOCK',
      version: '1.0.0'
    };
    
    return this.calculateHMAC(JSON.stringify(genesisData));
  }

  /**
   * Create integrity-protected audit log entry
   */
  async createProtectedAuditLog(auditData) {
    try {
      // Prepare audit entry
      const auditEntry = {
        ...auditData,
        timestamp: new Date(),
        sequenceNumber: await this.getNextSequenceNumber(),
        previousHash: this.hashChain
      };

      // Calculate integrity hash
      const dataToHash = this.prepareDataForHashing(auditEntry);
      const integrityHash = this.calculateHMAC(dataToHash);
      
      // Add integrity protection
      auditEntry.integrityHash = integrityHash;
      auditEntry.dataHash = this.calculateDataHash(auditData);
      auditEntry.protected = true;

      // Store in database
      const savedEntry = await this.storeAuditEntry(auditEntry);

      // Update hash chain
      this.hashChain = integrityHash;

      // Create backup entry for critical events
      if (this.isCriticalEvent(auditData.eventType)) {
        await this.createBackupEntry(savedEntry);
      }

      logger.debug('Protected audit entry created', {
        id: savedEntry._id,
        eventType: auditData.eventType,
        sequenceNumber: auditEntry.sequenceNumber
      });

      return savedEntry;

    } catch (error) {
      logger.error('Failed to create protected audit log:', error);
      throw new BaseException('Audit log creation failed', 'AUDIT_CREATION_ERROR', 500);
    }
  }

  /**
   * Verify audit log integrity
   */
  async verifyAuditIntegrity(startDate, endDate) {
    try {
      const auditEntries = await this.getAuditEntries(startDate, endDate);
      const results = {
        totalEntries: auditEntries.length,
        verifiedEntries: 0,
        corruptedEntries: 0,
        missingEntries: 0,
        chainBreaks: 0,
        errors: []
      };

      let previousHash = null;
      let expectedSequence = null;

      for (const entry of auditEntries) {
        const verification = await this.verifyAuditEntry(entry, previousHash, expectedSequence);
        
        if (verification.valid) {
          results.verifiedEntries++;
        } else {
          results.corruptedEntries++;
          results.errors.push({
            entryId: entry._id,
            sequenceNumber: entry.sequenceNumber,
            errors: verification.errors
          });
        }

        // Check for chain breaks
        if (previousHash && entry.previousHash !== previousHash) {
          results.chainBreaks++;
        }

        // Check for missing sequence numbers
        if (expectedSequence !== null && entry.sequenceNumber !== expectedSequence) {
          results.missingEntries += Math.abs(entry.sequenceNumber - expectedSequence);
        }

        previousHash = entry.integrityHash;
        expectedSequence = entry.sequenceNumber + 1;
      }

      // Log verification results
      await this.logIntegrityVerification(results);

      return results;

    } catch (error) {
      logger.error('Audit integrity verification failed:', error);
      throw new BaseException('Integrity verification failed', 'INTEGRITY_VERIFICATION_ERROR', 500);
    }
  }

  /**
   * Verify individual audit entry
   */
  async verifyAuditEntry(entry, expectedPreviousHash, expectedSequence) {
    const errors = [];
    let valid = true;

    try {
      // Check if entry has integrity protection
      if (!entry.protected || !entry.integrityHash) {
        errors.push('Entry not integrity protected');
        valid = false;
      }

      // Verify data hash
      const calculatedDataHash = this.calculateDataHash({
        eventType: entry.eventType,
        tenantId: entry.tenantId,
        userId: entry.userId,
        action: entry.action,
        details: entry.details,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent
      });

      if (entry.dataHash !== calculatedDataHash) {
        errors.push('Data hash mismatch - entry may have been tampered with');
        valid = false;
      }

      // Verify integrity hash
      const dataToHash = this.prepareDataForHashing(entry);
      const calculatedHash = this.calculateHMAC(dataToHash);

      if (entry.integrityHash !== calculatedHash) {
        errors.push('Integrity hash mismatch - entry may have been tampered with');
        valid = false;
      }

      // Verify chain continuity
      if (expectedPreviousHash && entry.previousHash !== expectedPreviousHash) {
        errors.push('Hash chain break detected');
        valid = false;
      }

      // Verify sequence number
      if (expectedSequence !== null && entry.sequenceNumber !== expectedSequence) {
        errors.push('Sequence number mismatch');
        valid = false;
      }

      // Verify timestamp (should be chronological)
      if (entry.timestamp && typeof entry.timestamp.getTime === 'function') {
        const now = new Date();
        if (entry.timestamp > now) {
          errors.push('Future timestamp detected');
          valid = false;
        }
      }

    } catch (error) {
      errors.push(`Verification error: ${error.message}`);
      valid = false;
    }

    return { valid, errors };
  }

  /**
   * Prepare data for hashing
   */
  prepareDataForHashing(entry) {
    // Create deterministic string representation
    const hashData = {
      eventType: entry.eventType,
      tenantId: entry.tenantId,
      userId: entry.userId,
      action: entry.action,
      timestamp: entry.timestamp.toISOString(),
      sequenceNumber: entry.sequenceNumber,
      previousHash: entry.previousHash,
      dataHash: entry.dataHash
    };

    // Sort keys to ensure consistency
    const sortedKeys = Object.keys(hashData).sort();
    const sortedData = {};
    sortedKeys.forEach(key => {
      sortedData[key] = hashData[key];
    });

    return JSON.stringify(sortedData);
  }

  /**
   * Calculate HMAC for integrity protection
   */
  calculateHMAC(data) {
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(data)
      .digest('hex');
  }

  /**
   * Calculate data hash (separate from integrity hash)
   */
  calculateDataHash(data) {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return crypto
      .createHash('sha256')
      .update(dataString)
      .digest('hex');
  }

  /**
   * Get next sequence number
   */
  async getNextSequenceNumber() {
    try {
      const lastEntry = await this.getLastAuditEntry();
      return lastEntry ? lastEntry.sequenceNumber + 1 : 1;
    } catch (error) {
      logger.error('Failed to get sequence number:', error);
      return 1;
    }
  }

  /**
   * Get last audit entry
   */
  async getLastAuditEntry() {
    const AuditLog = mongoose.model('AuditLog');
    return await AuditLog.findOne({}, {}, { sort: { sequenceNumber: -1 } });
  }

  /**
   * Store audit entry in database
   */
  async storeAuditEntry(auditEntry) {
    const AuditLog = mongoose.model('AuditLog');
    const entry = new AuditLog(auditEntry);
    return await entry.save();
  }

  /**
   * Get audit entries for verification
   */
  async getAuditEntries(startDate, endDate) {
    const AuditLog = mongoose.model('AuditLog');
    const query = {};
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = startDate;
      if (endDate) query.timestamp.$lte = endDate;
    }

    return await AuditLog.find(query).sort({ sequenceNumber: 1 });
  }

  /**
   * Check if event is critical (requires backup)
   */
  isCriticalEvent(eventType) {
    const criticalEvents = [
      'USER_DELETED',
      'ROLE_CHANGED',
      'PERMISSION_GRANTED',
      'DATA_EXPORTED',
      'SYSTEM_CONFIG_CHANGED',
      'SECURITY_INCIDENT_DETECTED',
      'AUDIT_LOG_ACCESSED'
    ];
    
    return criticalEvents.includes(eventType);
  }

  /**
   * Create backup entry for critical events
   */
  async createBackupEntry(auditEntry) {
    try {
      // Create encrypted backup
      const backupData = {
        originalId: auditEntry._id,
        encryptedEntry: this.encryptAuditEntry(auditEntry),
        backupTimestamp: new Date(),
        backupHash: this.calculateDataHash(auditEntry)
      };

      // Store backup (could be in separate database, cloud storage, etc.)
      await this.storeBackupEntry(backupData);

    } catch (error) {
      logger.error('Failed to create audit backup:', error);
    }
  }

  /**
   * Encrypt audit entry for backup
   */
  encryptAuditEntry(entry) {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(this.secretKey, 'audit-backup', 32);
    const iv = crypto.randomBytes(16);
    
    const cipher = crypto.createCipher(algorithm, key);
    cipher.setAAD(Buffer.from(entry._id.toString()));
    
    let encrypted = cipher.update(JSON.stringify(entry), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Store backup entry
   */
  async storeBackupEntry(backupData) {
    // Implementation depends on backup storage strategy
    // Could be MongoDB, AWS S3, separate audit database, etc.
    logger.info('Audit backup created', { originalId: backupData.originalId });
  }

  /**
   * Log integrity verification results
   */
  async logIntegrityVerification(results) {
    await this.createProtectedAuditLog({
      eventType: 'AUDIT_INTEGRITY_VERIFICATION',
      action: 'verify_integrity',
      details: {
        totalEntries: results.totalEntries,
        verifiedEntries: results.verifiedEntries,
        corruptedEntries: results.corruptedEntries,
        missingEntries: results.missingEntries,
        chainBreaks: results.chainBreaks,
        errorCount: results.errors.length
      },
      tenantId: 'system',
      userId: 'system'
    });
  }

  /**
   * Generate integrity report
   */
  async generateIntegrityReport(startDate, endDate) {
    const verification = await this.verifyAuditIntegrity(startDate, endDate);
    
    const report = {
      reportId: crypto.randomUUID(),
      generatedAt: new Date(),
      period: {
        startDate,
        endDate
      },
      summary: {
        totalEntries: verification.totalEntries,
        integrityStatus: verification.corruptedEntries === 0 ? 'INTACT' : 'COMPROMISED',
        integrityPercentage: verification.totalEntries > 0 
          ? ((verification.verifiedEntries / verification.totalEntries) * 100).toFixed(2)
          : 0
      },
      details: verification,
      recommendations: this.generateRecommendations(verification)
    };

    return report;
  }

  /**
   * Generate recommendations based on verification results
   */
  generateRecommendations(verification) {
    const recommendations = [];

    if (verification.corruptedEntries > 0) {
      recommendations.push('Investigate corrupted entries immediately');
      recommendations.push('Check for unauthorized access to audit logs');
      recommendations.push('Consider restoring from backup if available');
    }

    if (verification.chainBreaks > 0) {
      recommendations.push('Investigate hash chain breaks');
      recommendations.push('Verify system integrity');
    }

    if (verification.missingEntries > 0) {
      recommendations.push('Investigate missing audit entries');
      recommendations.push('Check for gaps in logging coverage');
    }

    if (recommendations.length === 0) {
      recommendations.push('Audit log integrity is maintained');
      recommendations.push('Continue regular integrity verification');
    }

    return recommendations;
  }
}

// Export singleton instance
export const integrityProtectedAuditService = new IntegrityProtectedAuditService();
