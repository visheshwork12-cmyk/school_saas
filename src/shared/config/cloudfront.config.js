// src/shared/config/cloudfront.config.js
import { logger } from '#utils/core/logger.js';

export class CloudFrontConfig {
  constructor() {
    this.distributionDomain = process.env.CLOUDFRONT_DISTRIBUTION_DOMAIN;
    this.enabled = process.env.CLOUDFRONT_ENABLED === 'true';
    this.defaultTTL = parseInt(process.env.CLOUDFRONT_DEFAULT_TTL) || 86400;
    this.maxTTL = parseInt(process.env.CLOUDFRONT_MAX_TTL) || 31536000;
    
    if (this.enabled && !this.distributionDomain) {
      logger.warn('CloudFront enabled but CLOUDFRONT_DISTRIBUTION_DOMAIN not set');
    }
  }

  getAssetUrl(path, options = {}) {
    if (!this.enabled || !this.distributionDomain) {
      return path; // Fallback to original URL
    }

    const { 
      width, 
      height, 
      quality = 'auto', 
      format = 'auto',
      version = 'v1'
    } = options;

    let url = `https://${this.distributionDomain}/${version}${path}`;
    
    // Add transformation parameters for images
    if (width || height || quality !== 'auto' || format !== 'auto') {
      const params = new URLSearchParams();
      if (width) params.set('w', width);
      if (height) params.set('h', height);
      if (quality !== 'auto') params.set('q', quality);
      if (format !== 'auto') params.set('f', format);
      url += `?${params.toString()}`;
    }

    return url;
  }

  getCacheHeaders(contentType) {
    const cacheConfig = {
      'image/*': { maxAge: this.maxTTL, public: true },
      'video/*': { maxAge: this.maxTTL, public: true },
      'audio/*': { maxAge: this.maxTTL, public: true },
      'application/pdf': { maxAge: 604800, public: true }, // 1 week
      'text/css': { maxAge: this.maxTTL, public: true },
      'application/javascript': { maxAge: this.maxTTL, public: true },
      'default': { maxAge: this.defaultTTL, public: true }
    };

    return cacheConfig[contentType] || cacheConfig.default;
  }
}

export const cloudFrontConfig = new CloudFrontConfig();
