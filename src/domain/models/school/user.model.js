import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { encryptionPlugin } from '#core/security/plugins/encryption.plugin.js';
import ROLES from '#domain/enums/roles.enum.js';
import USER_STATUS from '#domain/enums/user-status.enum.js';

const { Schema } = mongoose;

/**
 * @description Mongoose schema for User.
 * Includes roles, permissions, multi-tenant support, encryption, and soft delete.
 */
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    phone: {
      type: String,
      sparse: true
    },
    aadharNumber: {
      type: String,
      sparse: true
    },
    panNumber: {
      type: String,
      sparse: true
    },
    personalDetails: {
      address: {
        street: String,
        city: String,
        pincode: String
      },
      emergencyContact: {
        name: String,
        phone: String,
        relation: String
      }
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      required: true
    },
    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.PENDING
    },
    organizationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    schoolId: {
      type: Schema.Types.ObjectId,
      ref: 'School',
      required: true
    },
    permissions: [{ type: String }],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform: function(doc, ret) {
        // Remove sensitive data from JSON output
        delete ret.password;
        delete ret.email_hash;
        delete ret.phone_hash;
        delete ret.aadharNumber_hash;
        delete ret.panNumber_hash;
        return ret;
      }
    }
  }
);

// Password encryption
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(
      this.password,
      parseInt(process.env.BCRYPT_SALT_ROUNDS, 10)
    );
  }
  next();
});

// Apply encryption plugin for sensitive fields
userSchema.plugin(encryptionPlugin, {
  encryptedFields: [
    'email',
    'phone',
    'aadharNumber',
    'panNumber',
    'personalDetails.emergencyContact.phone'
  ],
  searchableFields: [
    'email',
    'phone'
  ],
  contextField: 'organizationId'
});

// Compound indexes for efficient queries
userSchema.index(
  { organizationId: 1, schoolId: 1, email: 1 },
  { unique: true }
);
userSchema.index({ role: 1, status: 1 });

// Soft delete middleware
userSchema.pre(/^find/, function(next) {
  this.where({ isDeleted: false });
  next();
});

const User = mongoose.model('User', userSchema);

export default User;