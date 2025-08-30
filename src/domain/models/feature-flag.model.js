import mongoose from 'mongoose';
import { logger } from '#utils/core/logger.js';

/**
 * @description Mongoose schema for feature flags
 * @type {mongoose.Schema}
 */
const featureFlagSchema = new mongoose.Schema(
  {
    feature: { type: String, required: true, unique: true },
    enabled: { type: Boolean, default: false },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null }, // For tenant-specific flags
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
featureFlagSchema.index({ feature: 1, organizationId: 1 }, { unique: true });
featureFlagSchema.index({ organizationId: 1, enabled: 1 });

// Soft delete
featureFlagSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

// Audit logging on update
featureFlagSchema.pre('save', async function (next) {
  if (this.isModified()) {
    logger.debug(`Feature flag updated: ${this.feature}`);
  }
  next();
});

const FeatureFlagModel = mongoose.model('FeatureFlag', featureFlagSchema);

export { FeatureFlagModel };