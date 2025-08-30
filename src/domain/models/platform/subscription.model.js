// src/domain/models/platform/subscription.model.js

import mongoose from 'mongoose';
import { SUBSCRIPTION_STATUS } from '#domain/enums/subscription-status.enum.js';

const { Schema } = mongoose;

/**
 * @description Mongoose schema for Subscription.
 * Includes lifecycle states, billing, features, limits.
 */
const subscriptionSchema = new Schema(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    planId: { type: String, required: true },
    status: { type: String, enum: Object.values(SUBSCRIPTION_STATUS), default: SUBSCRIPTION_STATUS.TRIAL },
    currentPeriod: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    billing: {
      amount: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
      interval: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
      nextBillDate: { type: Date },
    },
    features: [{ type: String }],
    limits: {
      students: { type: Number, default: 0 },
      teachers: { type: Number, default: 0 },
      storage: { type: Number, default: 0 },
    },
    usage: {
      students: { type: Number, default: 0 },
      teachers: { type: Number, default: 0 },
      storageUsed: { type: Number, default: 0 },
    },
    trial: {
      isActive: { type: Boolean, default: false },
      startDate: { type: Date },
      endDate: { type: Date },
      daysRemaining: { type: Number },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
subscriptionSchema.index({ organizationId: 1, status: 1 });
subscriptionSchema.index({ currentPeriod: { end: 1 } }); // For expiry checks

// Soft delete
subscriptionSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

const SubscriptionModel = mongoose.model('Subscription', subscriptionSchema);

export { SubscriptionModel };