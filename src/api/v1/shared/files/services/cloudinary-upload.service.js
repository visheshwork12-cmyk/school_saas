// src/api/v1/shared/files/services/cloudinary-upload.service.js
import multer from 'multer';
import { CloudinaryClient } from '#infrastructure/external/storage/cloudinary.client.js';
import { logger } from '#utils/core/logger.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';

/**
 * Cloudinary Upload Service for School ERP
 * Handles file uploads with tenant isolation and security
 */
export class CloudinaryUploadService {
  constructor() {
    this.cloudinaryClient = CloudinaryClient.getInstance();
    this.setupMulter();
  }
  
  /**
   * Setup multer for memory storage (Vercel friendly)
   */
  setupMulter() {
    this.upload = multer({
      storage: multer.memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 5, // Max 5 files
      },
      fileFilter: this.fileFilter.bind(this),
    });
  }
  
  /**
   * File filter for security
   */
  fileFilter(req, file, cb) {
    const allowedTypes = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    };
    
    if (allowedTypes[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new BusinessException('Invalid file type', 'INVALID_FILE_TYPE', 400), false);
    }
  }
  
  /**
   * Upload single file
   * @param {Object} file - Multer file object
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  async uploadSingle(file, options = {}) {
    try {
      const {
        tenantId,
        userId,
        category = 'general',
        isPublic = false,
        generateThumbnails = true,
      } = options;
      
      if (!file || !file.buffer) {
        throw new BusinessException('No file provided', 'NO_FILE', 400);
      }
      
      // Determine resource type
      const resourceType = file.mimetype.startsWith('image/') ? 'image' : 
                          file.mimetype === 'application/pdf' ? 'image' : 'raw';
      
      // Generate unique filename
      const timestamp = Date.now();
      const originalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const publicId = `${category}/${timestamp}_${originalName}`;
      
      // Upload to Cloudinary
      const uploadResult = await this.cloudinaryClient.uploadFile(file.buffer, {
        tenantId,
        resourceType,
        publicId,
        tags: [category, userId, tenantId].filter(Boolean),
        transformation: resourceType === 'image' ? {
          quality: 'auto:good',
          fetch_format: 'auto',
        } : {},
      });
      
      // Generate responsive URLs for images
      let responsiveUrls = {};
      if (resourceType === 'image' && generateThumbnails) {
        responsiveUrls = this.cloudinaryClient.generateResponsiveUrls(uploadResult.publicId);
      }
      
      // Audit log
      await AuditService.log('FILE_UPLOADED', {
        tenantId,
        userId,
        action: 'file_upload',
        details: {
          fileName: file.originalname,
          fileSize: file.size,
          publicId: uploadResult.publicId,
          category,
        },
      });
      
      return {
        success: true,
        file: {
          id: uploadResult.publicId,
          originalName: file.originalname,
          fileName: publicId,
          url: uploadResult.secureUrl,
          size: file.size,
          mimeType: file.mimetype,
          category,
          isPublic,
          responsiveUrls,
          metadata: {
            width: uploadResult.width,
            height: uploadResult.height,
            format: uploadResult.format,
            bytes: uploadResult.bytes,
          },
          uploadedAt: new Date(),
          uploadedBy: userId,
          tenantId,
        },
      };
      
    } catch (error) {
      logger.error('❌ File upload failed', { 
        error: error.message,
        fileName: file?.originalname,
        tenantId: options.tenantId 
      });
      throw error;
    }
  }
  
  /**
   * Upload multiple files
   * @param {Array} files - Array of multer file objects
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload results
   */
  async uploadMultiple(files, options = {}) {
    try {
      const results = [];
      const errors = [];
      
      for (let i = 0; i < files.length; i++) {
        try {
          const result = await this.uploadSingle(files[i], {
            ...options,
            category: options.category || `batch_${Date.now()}`,
          });
          results.push(result.file);
        } catch (error) {
          errors.push({
            file: files[i].originalname,
            error: error.message,
          });
        }
      }
      
      return {
        success: errors.length === 0,
        uploaded: results,
        errors,
        totalFiles: files.length,
        successCount: results.length,
        errorCount: errors.length,
      };
      
    } catch (error) {
      logger.error('❌ Multiple file upload failed', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Delete file
   * @param {string} publicId - File public ID
   * @param {Object} options - Delete options
   * @returns {Promise<Object>} Delete result
   */
  async deleteFile(publicId, options = {}) {
    try {
      const { tenantId, userId } = options;
      
      const result = await this.cloudinaryClient.deleteFile(publicId);
      
      // Audit log
      await AuditService.log('FILE_DELETED', {
        tenantId,
        userId,
        action: 'file_delete',
        details: { publicId },
      });
      
      return result;
      
    } catch (error) {
      logger.error('❌ File deletion failed', { error: error.message, publicId });
      throw error;
    }
  }
  
  /**
   * Get optimized file URL
   * @param {string} publicId - File public ID
   * @param {Object} transformations - Transformation options
   * @returns {string} Optimized URL
   */
  getOptimizedUrl(publicId, transformations = {}) {
    return this.cloudinaryClient.getOptimizedUrl(publicId, transformations);
  }
}

export default CloudinaryUploadService;
