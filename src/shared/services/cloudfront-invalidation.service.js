// src/shared/services/cloudfront-invalidation.service.js
import AWS from 'aws-sdk';
import { logger } from '#utils/core/logger.js';

export class CloudFrontInvalidationService {
  constructor() {
    this.cloudfront = new AWS.CloudFront({
      region: process.env.AWS_REGION || 'us-east-1'
    });
    this.distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
    this.enabled = process.env.CLOUDFRONT_INVALIDATION_ENABLED === 'true';
  }

  async invalidatePaths(paths, callerReference = null) {
    if (!this.enabled || !this.distributionId) {
      logger.warn('CloudFront invalidation not configured');
      return null;
    }

    try {
      const params = {
        DistributionId: this.distributionId,
        InvalidationBatch: {
          CallerReference: callerReference || `invalidation-${Date.now()}`,
          Paths: {
            Quantity: paths.length,
            Items: paths
          }
        }
      };

      const result = await this.cloudfront.createInvalidation(params).promise();
      
      logger.info('CloudFront invalidation created', {
        invalidationId: result.Invalidation.Id,
        paths: paths.length
      });

      return result.Invalidation;
    } catch (error) {
      logger.error('CloudFront invalidation failed', {
        error: error.message,
        paths
      });
      throw error;
    }
  }

  async invalidateAsset(publicId, tenantId) {
    const paths = [
      `/tenants/${tenantId}/image/upload/${publicId}*`,
      `/v1/tenants/${tenantId}/image/upload/${publicId}*`
    ];

    return this.invalidatePaths(paths, `asset-${publicId}-${Date.now()}`);
  }

  async invalidateTenantAssets(tenantId) {
    const paths = [
      `/tenants/${tenantId}/*`,
      `/v1/tenants/${tenantId}/*`
    ];

    return this.invalidatePaths(paths, `tenant-${tenantId}-${Date.now()}`);
  }
}

export const cloudFrontInvalidationService = new CloudFrontInvalidationService();
