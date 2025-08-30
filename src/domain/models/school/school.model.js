// src/domain/models/school/school.model.js

import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * @description Mongoose schema for School profile.
 * Includes multi-tenant and audit fields.
 */
const schoolSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    address: { type: String, trim: true },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    schoolId: { type: Schema.Types.ObjectId, required: true, unique: true },
    settings: { type: Schema.Types.Mixed }, // Flexible settings
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
schoolSchema.index({ organizationId: 1, schoolId: 1 }, { unique: true });
schoolSchema.index({ name: 'text' });

// Soft delete
schoolSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

const SchoolModel = mongoose.model('School', schoolSchema);

export default SchoolModel;