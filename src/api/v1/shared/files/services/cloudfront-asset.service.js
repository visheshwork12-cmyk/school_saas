// src/api/v1/shared/files/services/cloudfront-asset.service.js
import { cloudFrontConfig } from '#shared/config/cloudfront.config.js';
import { CloudinaryClient } from '#infrastructure/external/storage/cloudinary.client.js';
import { logger } from '#utils/core/logger.js';

export class CloudFrontAssetService {
  constructor() {
    this.cloudinary = CloudinaryClient.getInstance();
    this.cloudFront = cloudFrontConfig;
  }

  /**
   * Get optimized asset URL through CloudFront
   */
  getAssetUrl(publicId, options = {}) {
    try {
      const { 
        tenantId,
        width,
        height,
        quality = 'auto:good',
        format = 'auto',
        crop = 'fill',
        gravity = 'auto',
        useCloudFront = true
      } = options;

      // Generate Cloudinary URL first
      let assetUrl = this.cloudinary.getOptimizedUrl(publicId, {
        width, height, quality, format, crop, gravity
      });

      // If CloudFront is enabled, replace Cloudinary domain
      if (useCloudFront && this.cloudFront.enabled) {
        assetUrl = this.replaceWithCloudFront(assetUrl, { tenantId });
      }

      return assetUrl;
    } catch (error) {
      logger.error('Failed to generate asset URL', { 
        error: error.message, 
        publicId, 
        options 
      });
      return null;
    }
  }

  /**
   * Replace Cloudinary URL with CloudFront URL
   */
  replaceWithCloudFront(cloudinaryUrl, options = {}) {
    try {
      const url = new URL(cloudinaryUrl);
      const { tenantId } = options;

      // Extract path from Cloudinary URL
      let path = url.pathname;
      
      // Add tenant prefix if available
      if (tenantId) {
        path = `/tenants/${tenantId}${path}`;
      }

      // Build CloudFront URL
      const cloudFrontUrl = `https://${this.cloudFront.distributionDomain}${path}`;
      
      // Preserve query parameters
      if (url.search) {
        return `${cloudFrontUrl}${url.search}`;
      }

      return cloudFrontUrl;
    } catch (error) {
      logger.warn('Failed to replace with CloudFront URL', { 
        error: error.message, 
        cloudinaryUrl 
      });
      return cloudinaryUrl; // Fallback to original
    }
  }

  /**
   * Generate multiple responsive image URLs
   */
  getResponsiveUrls(publicId, tenantId, breakpoints = [400, 800, 1200, 1600]) {
    const urls = {};
    
    breakpoints.forEach(width => {
      urls[`${width}w`] = this.getAssetUrl(publicId, {
        tenantId,
        width,
        quality: 'auto:good',
        format: 'auto'
      });
    });

    return urls;
  }

  /**
   * Get PDF document URL with viewer optimizations
   */
  getDocumentUrl(publicId, tenantId, options = {}) {
    const { 
      page = 1, 
      format = 'jpg',
      quality = 90,
      width = 800 
    } = options;

    return this.getAssetUrl(publicId, {
      tenantId,
      width,
      quality,
      format,
      page, // For PDF page conversion
      flags: 'progressive'
    });
  }
}

export const cloudFrontAssetService = new CloudFrontAssetService();
