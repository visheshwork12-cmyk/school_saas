// src/infrastructure/external/storage/cloudinary.client.js
import { cloudinary, cloudinaryConfig } from '#shared/config/cloudinary.config.js';
import { logger } from '#utils/core/logger.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';

/**
 * Cloudinary Client for File Operations
 * Hybrid approach supporting both Vercel and AWS
 */
export class CloudinaryClient {
  static instance = null;

  constructor() {
    this.cloudinary = cloudinary;
    this.config = cloudinaryConfig;
  }

  static getInstance() {
    if (!this.instance) {
      this.instance = new CloudinaryClient();
    }
    return this.instance;
  }

  /**
   * Upload file to Cloudinary with tenant isolation
   * @param {Buffer|string} file - File buffer or path
   * @param {Object} options - Upload options
   * @returns {Promise<Object>} Upload result
   */
  // src/infrastructure/external/storage/cloudinary.client.js
  // Replace the uploadFile method with this corrected version:

  async uploadFile(file, options = {}) {
    try {
      const {
        folder = this.config.folder,
        tenantId,
        resourceType = 'auto',
        transformation = {},
        tags = [],
        publicId,
        overwrite = false,
        invalidate = true,
      } = options;

      // Create tenant-specific folder
      const tenantFolder = tenantId ? `${folder}/${tenantId}` : folder;

      const uploadOptions = {
        folder: tenantFolder,
        resource_type: resourceType,
        transformation,
        tags: [...tags, tenantId, process.env.NODE_ENV].filter(Boolean),
        public_id: publicId,
        overwrite,
        invalidate,
        use_filename: true,
        unique_filename: !publicId,
        faces: true,
        colors: true,
        image_metadata: true,
        quality: 'auto:good',
        fetch_format: 'auto',
      };

      logger.info('📤 Uploading file to Cloudinary', {
        folder: tenantFolder,
        resourceType,
        tenantId,
        fileType: typeof file
      });

      let result;

      // ✅ FIX: Handle different file input types
      if (Buffer.isBuffer(file)) {
        // For Buffer input, convert to base64 data URI
        const base64String = file.toString('base64');
        const mimeType = this.detectMimeType(file) || 'image/jpeg';
        const dataUri = `data:${mimeType};base64,${base64String}`;
        result = await this.cloudinary.uploader.upload(dataUri, uploadOptions);
      } else if (typeof file === 'string' && file.startsWith('data:')) {
        // For data URI strings
        result = await this.cloudinary.uploader.upload(file, uploadOptions);
      } else if (typeof file === 'string') {
        // For file paths
        result = await this.cloudinary.uploader.upload(file, uploadOptions);
      } else {
        throw new Error('Unsupported file input type. Expected Buffer, string path, or data URI.');
      }

      logger.info('✅ File uploaded successfully', {
        publicId: result.public_id,
        url: result.secure_url,
        tenantId
      });

      return {
        success: true,
        publicId: result.public_id,
        url: result.secure_url,
        secureUrl: result.secure_url,
        width: result.width,
        height: result.height,
        format: result.format,
        resourceType: result.resource_type,
        bytes: result.bytes,
        createdAt: result.created_at,
        folder: tenantFolder,
        tags: result.tags,
        transformation: result.transformation,
      };

    } catch (error) {
      logger.error('❌ Cloudinary upload failed', {
        error: error.message,
        tenantId: options.tenantId,
        stack: error.stack
      });
      throw new BusinessException(`File upload failed: ${error.message}`, 'UPLOAD_FAILED', 500);
    }
  }

  /**
   * Detect MIME type from buffer
   * @param {Buffer} buffer 
   * @returns {string|null}
   */
  detectMimeType(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

    // Check file signatures
    const signatures = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
      'image/webp': [0x52, 0x49, 0x46, 0x46] // RIFF header
    };

    for (const [mimeType, signature] of Object.entries(signatures)) {
      if (signature.every((byte, index) => buffer[index] === byte)) {
        return mimeType;
      }
    }

    return 'application/octet-stream';
  }


  /**
   * Delete file from Cloudinary
   * @param {string} publicId - Public ID of file to delete
   * @param {Object} options - Delete options
   * @returns {Promise<Object>} Delete result
   */
  async deleteFile(publicId, options = {}) {
    try {
      const { resourceType = 'image', invalidate = true } = options;

      logger.info('🗑️ Deleting file from Cloudinary', { publicId });

      const result = await this.cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
        invalidate,
      });

      logger.info('✅ File deleted successfully', { publicId, result: result.result });

      return {
        success: result.result === 'ok',
        publicId,
        result: result.result,
      };

    } catch (error) {
      logger.error('❌ Cloudinary delete failed', { error: error.message, publicId });
      throw new BusinessException(`File deletion failed: ${error.message}`, 'DELETE_FAILED', 500);
    }
  }

  /**
   * Get optimized URL with transformations
   * @param {string} publicId - Public ID of file
   * @param {Object} transformations - Transformation options
   * @returns {string} Optimized URL
   */
  getOptimizedUrl(publicId, transformations = {}) {
    try {
      const {
        width,
        height,
        crop = 'fill',
        quality = 'auto:good',
        format = 'auto',
        gravity = 'auto',
        radius,
        effect,
        overlay,
        border,
      } = transformations;

      return this.cloudinary.url(publicId, {
        width,
        height,
        crop,
        quality,
        fetch_format: format,
        gravity,
        radius,
        effect,
        overlay,
        border,
        secure: true,
        sign_url: true, // For security in production
      });

    } catch (error) {
      logger.error('❌ URL generation failed', { error: error.message, publicId });
      return null;
    }
  }

  /**
   * Generate multiple image sizes (responsive images)
   * @param {string} publicId - Public ID of image
   * @param {Array} sizes - Array of size objects
   * @returns {Object} URLs for different sizes
   */
  generateResponsiveUrls(publicId, sizes = []) {
    const defaultSizes = [
      { name: 'thumbnail', width: 150, height: 150 },
      { name: 'small', width: 300, height: 300 },
      { name: 'medium', width: 600, height: 600 },
      { name: 'large', width: 1200, height: 1200 },
      { name: 'original', width: null, height: null },
    ];

    const sizeConfig = sizes.length > 0 ? sizes : defaultSizes;
    const urls = {};

    sizeConfig.forEach(size => {
      urls[size.name] = this.getOptimizedUrl(publicId, {
        width: size.width,
        height: size.height,
        crop: 'fill',
        gravity: 'auto',
      });
    });

    return urls;
  }

  /**
   * Get folder contents (for admin purposes)
   * @param {string} folder - Folder path
   * @param {Object} options - List options
   * @returns {Promise<Object>} Folder contents
   */
  async getFolderContents(folder, options = {}) {
    try {
      const { maxResults = 100, nextCursor } = options;

      const result = await this.cloudinary.api.resources({
        type: 'upload',
        prefix: folder,
        max_results: maxResults,
        next_cursor: nextCursor,
      });

      return {
        resources: result.resources,
        nextCursor: result.next_cursor,
        totalCount: result.total_count,
      };

    } catch (error) {
      logger.error('❌ Failed to get folder contents', { error: error.message, folder });
      throw new BusinessException(`Failed to get folder contents: ${error.message}`, 'FOLDER_LIST_FAILED', 500);
    }
  }
}

export default CloudinaryClient;
