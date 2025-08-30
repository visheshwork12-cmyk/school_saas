// src/domain/models/platform/organization.model.js

import mongoose from 'mongoose';
import { SUBSCRIPTION_STATUS } from '#domain/enums/subscription-status.enum.js';

const { Schema } = mongoose;

/**
 * @description Mongoose schema for Organization.
 * Includes multi-tenant fields and audit trails.
 */
const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    subscriptionStatus: {
      type: String,
      enum: Object.values(SUBSCRIPTION_STATUS),
      default: SUBSCRIPTION_STATUS.TRIAL,
    },
    organizationId: { type: Schema.Types.ObjectId, required: true, unique: true }, // Self-reference for tenant
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true, // Auto createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound index for tenant isolation and performance
organizationSchema.index({ organizationId: 1, subscriptionStatus: 1 });
organizationSchema.index({ name: 'text' }); // For search

// Soft delete plugin simulation
organizationSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

const OrganizationModel = mongoose.model('Organization', organizationSchema);

export default OrganizationModel;