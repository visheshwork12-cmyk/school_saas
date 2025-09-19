// src/core/security/plugins/encryption.plugin.js
import { fieldEncryption } from '../services/field-encryption.service.js';
import { logger } from '#utils/core/logger.js';

/**
 * Mongoose plugin for automatic field encryption/decryption
 */
export function encryptionPlugin(schema, options = {}) {
  const {
    encryptedFields = [],
    searchableFields = [],
    contextField = 'organizationId'
  } = options;

  // Add search hash fields for encrypted searchable fields
  searchableFields.forEach(fieldName => {
    if (encryptedFields.includes(fieldName)) {
      schema.add({
        [`${fieldName}_hash`]: {
          type: String,
          index: true
        }
      });
    }
  });

  // Pre-save middleware for encryption
  schema.pre(['save', 'findOneAndUpdate', 'updateOne', 'updateMany'], async function() {
    try {
      const doc = this;
      const update = this.getUpdate ? this.getUpdate() : doc;
      const contextId = doc[contextField] || update[contextField];

      // Encrypt specified fields
      for (const fieldName of encryptedFields) {
        const value = update[fieldName] || doc[fieldName];
        
        if (value && !this.isEncrypted(value)) {
          const encrypted = fieldEncryption.encryptField(value, fieldName, contextId);
          
          if (doc[fieldName] !== undefined) {
            doc[fieldName] = encrypted;
          }
          if (update[fieldName] !== undefined) {
            update[fieldName] = encrypted;
          }

          // Generate search hash if field is searchable
          if (searchableFields.includes(fieldName)) {
            const searchHash = fieldEncryption.generateSearchHash(value, fieldName);
            
            if (doc[`${fieldName}_hash`] !== undefined) {
              doc[`${fieldName}_hash`] = searchHash;
            }
            if (update[`${fieldName}_hash`] !== undefined) {
              update[`${fieldName}_hash`] = searchHash;
            }
          }
        }
      }
    } catch (error) {
      logger.error('Pre-save encryption failed:', error.message);
      throw error;
    }
  });

  // Post-find middleware for decryption
  schema.post(['find', 'findOne', 'findOneAndUpdate'], async function(docs) {
    try {
      if (!docs) return;
      
      const docsArray = Array.isArray(docs) ? docs : [docs];
      
      for (const doc of docsArray) {
        if (doc && typeof doc.toObject === 'function') {
          const contextId = doc[contextField];
          
          for (const fieldName of encryptedFields) {
            if (doc[fieldName] && this.isEncrypted(doc[fieldName])) {
              doc[fieldName] = fieldEncryption.decryptField(
                doc[fieldName],
                fieldName,
                contextId
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error('Post-find decryption failed:', error.message);
      // Don't throw error to avoid breaking queries
    }
  });

  // Helper method to check if value is encrypted
  schema.methods.isEncrypted = function(value) {
    try {
      if (typeof value !== 'string') return false;
      const parsed = JSON.parse(value);
      return parsed.encrypted && parsed.iv && parsed.authTag;
    } catch {
      return false;
    }
  };

  // Method to search encrypted fields
  schema.statics.searchEncrypted = function(fieldName, searchTerm) {
    if (!searchableFields.includes(fieldName)) {
      throw new Error(`Field ${fieldName} is not searchable`);
    }
    
    const searchHash = fieldEncryption.generateSearchHash(searchTerm, fieldName);
    return this.find({ [`${fieldName}_hash`]: searchHash });
  };
}


// Vo 51 ko ueha se hatva k apne ctc m as part of of regular payment kr lo


