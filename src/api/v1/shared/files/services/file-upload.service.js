// Update in src/api/v1/shared/files/services/file-upload.service.js
import { cloudFrontAssetService } from './cloudfront-asset.service.js';
import { cloudFrontInvalidationService } from '#shared/services/cloudfront-invalidation.service.js';

export class FileUploadService {
  async uploadFile(file, options = {}) {
    try {
      const { tenantId } = options;
      
      // Upload to Cloudinary
      const uploadResult = await this.cloudinary.uploadFile(file, options);
      
      // Generate CloudFront URLs
      const assetUrls = {
        original: cloudFrontAssetService.getAssetUrl(uploadResult.publicId, { tenantId }),
        thumbnail: cloudFrontAssetService.getAssetUrl(uploadResult.publicId, { 
          tenantId, width: 200, height: 200, crop: 'fill' 
        }),
        responsive: cloudFrontAssetService.getResponsiveUrls(uploadResult.publicId, tenantId)
      };

      return {
        ...uploadResult,
        urls: assetUrls,
        cloudFrontEnabled: true
      };
    } catch (error) {
      logger.error('File upload failed', { error: error.message });
      throw error;
    }
  }

  async deleteFile(publicId, tenantId) {
    try {
      // Delete from Cloudinary
      await this.cloudinary.deleteFile(publicId);
      
      // Invalidate CloudFront cache
      await cloudFrontInvalidationService.invalidateAsset(publicId, tenantId);
      
      return { success: true };
    } catch (error) {
      logger.error('File deletion failed', { error: error.message, publicId });
      throw error;
    }
  }
}
