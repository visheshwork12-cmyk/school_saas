// src/domain/models/school/user.model.js

import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import ROLES from '#domain/enums/roles.enum.js';
import USER_STATUS from '#domain/enums/user-status.enum.js';

const { Schema } = mongoose;

/**
 * @description Mongoose schema for User.
 * Includes roles, permissions, multi-tenant, and encryption.
 */
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false }, // Encrypted
    role: { type: String, enum: Object.values(ROLES), required: true },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.PENDING },
    organizationId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    schoolId: { type: Schema.Types.ObjectId, ref: 'School', required: true },
    permissions: [{ type: String }], // Array for RBAC
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

// Password encryption
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, parseInt(process.env.BCRYPT_SALT_ROUNDS, 10));
  }
  next();
});

// Compound indexes for queries
userSchema.index({ organizationId: 1, schoolId: 1, email: 1 }, { unique: true });
userSchema.index({ role: 1, status: 1 });

// Soft delete
userSchema.pre(/^find/, function (next) {
  this.where({ isDeleted: false });
  next();
});

const UserModel = mongoose.model('User', userSchema);

export default UserModel;