// src/domain/models/shared/integrity-protected-audit-log.model.js
import mongoose from "mongoose";

const integrityProtectedAuditLogSchema = new mongoose.Schema({
  // Standard audit fields
  eventType: {
    type: String,
    required: true,
    index: true
  },
  tenantId: {
    type: String,
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  action: {
    type: String,
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed
  },
  ipAddress: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },

  // Integrity protection fields
  sequenceNumber: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  previousHash: {
    type: String,
    required: true
  },
  integrityHash: {
    type: String,
    required: true,
    index: true
  },
  dataHash: {
    type: String,
    required: true
  },
  protected: {
    type: Boolean,
    default: true,
    index: true
  },

  // Backup and verification fields
  backupCreated: {
    type: Boolean,
    default: false
  },
  lastVerified: {
    type: Date,
    index: true
  },
  verificationStatus: {
    type: String,
    enum: ['PENDING', 'VERIFIED', 'CORRUPTED', 'UNVERIFIED'],
    default: 'PENDING',
    index: true
  }
}, {
  timestamps: true,
  collection: 'integrity_protected_audit_logs'
});

// Compound indexes for efficient querying
integrityProtectedAuditLogSchema.index({ tenantId: 1, timestamp: -1 });
integrityProtectedAuditLogSchema.index({ eventType: 1, timestamp: -1 });
integrityProtectedAuditLogSchema.index({ userId: 1, timestamp: -1 });
integrityProtectedAuditLogSchema.index({ sequenceNumber: 1, integrityHash: 1 });

// TTL index for automatic cleanup (optional, based on retention policy)
integrityProtectedAuditLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 31536000 }); // 1 year

// Middleware to prevent modification
integrityProtectedAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function() {
  throw new Error('Audit logs cannot be modified after creation');
});

integrityProtectedAuditLogSchema.pre('deleteOne', function() {
  throw new Error('Audit logs cannot be deleted');
});

integrityProtectedAuditLogSchema.pre('deleteMany', function() {
  throw new Error('Audit logs cannot be deleted');
});

export default mongoose.model('IntegrityProtectedAuditLog', integrityProtectedAuditLogSchema);
