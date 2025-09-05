// src/domain/models/shared/file.model.js
import mongoose from 'mongoose';
import { CloudinaryClient } from '#infrastructure/external/storage/cloudinary.client.js';

const fileSchema = new mongoose.Schema({
  // Original fields
  tenantId: { type: String, required: true, index: true },
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  
  // Cloudinary specific fields
  cloudinaryPublicId: { type: String, required: true, unique: true },
  cloudinaryUrl: { type: String, required: true },
  cloudinarySecureUrl: { type: String, required: true },
  
  // File metadata
  category: { type: String, default: 'general', index: true },
  isPublic: { type: Boolean, default: false },
  
  // Image specific metadata
  width: Number,
  height: Number,
  format: String,
  
  // Responsive URLs (for images)
  responsiveUrls: {
    thumbnail: String,
    small: String,
    medium: String,
    large: String,
  },
  
  // File organization
  folder: String,
  tags: [String],
  
  // Access control
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  accessibleBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'deleted', 'processing'], 
    default: 'active' 
  },
  
  // Timestamps
  uploadedAt: { type: Date, default: Date.now },
  deletedAt: Date,
  lastAccessedAt: Date,
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
fileSchema.index({ tenantId: 1, category: 1, status: 1 });
fileSchema.index({ cloudinaryPublicId: 1 }, { unique: true });
fileSchema.index({ uploadedBy: 1, uploadedAt: -1 });
fileSchema.index({ tags: 1 });

// Virtual for optimized URLs
fileSchema.virtual('optimizedUrls').get(function() {
  const cloudinaryClient = CloudinaryClient.getInstance();
  return {
    thumbnail: cloudinaryClient.getOptimizedUrl(this.cloudinaryPublicId, { 
      width: 150, height: 150, crop: 'fill' 
    }),
    small: cloudinaryClient.getOptimizedUrl(this.cloudinaryPublicId, { 
      width: 300, height: 300, crop: 'fill' 
    }),
    medium: cloudinaryClient.getOptimizedUrl(this.cloudinaryPublicId, { 
      width: 600, height: 600, crop: 'fill' 
    }),
    large: cloudinaryClient.getOptimizedUrl(this.cloudinaryPublicId, { 
      width: 1200, height: 1200, crop: 'fill' 
    }),
  };
});

// Pre-save middleware
fileSchema.pre('save', function(next) {
  if (this.isNew) {
    this.uploadedAt = new Date();
  }
  next();
});

// Pre-delete middleware (soft delete)
fileSchema.pre('deleteOne', async function(next) {
  const doc = await this.model.findOne(this.getQuery());
  if (doc && doc.cloudinaryPublicId) {
    try {
      const cloudinaryClient = CloudinaryClient.getInstance();
      await cloudinaryClient.deleteFile(doc.cloudinaryPublicId);
    } catch (error) {
      console.error('Failed to delete from Cloudinary:', error);
    }
  }
  next();
});

// Instance methods
fileSchema.methods.getOptimizedUrl = function(transformations = {}) {
  const cloudinaryClient = CloudinaryClient.getInstance();
  return cloudinaryClient.getOptimizedUrl(this.cloudinaryPublicId, transformations);
};

fileSchema.methods.softDelete = function() {
  this.status = 'deleted';
  this.deletedAt = new Date();
  return this.save();
};

export default mongoose.model('File', fileSchema);
