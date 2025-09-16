// src/infrastructure/external/storage/enhanced-s3.service.js
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import path from 'path';
import mime from 'mime-types';

/**
 * Enhanced S3 Service for Static Assets Management
 */
class EnhancedS3Service {
  constructor() {
    this.s3Client = new S3Client({
      region: baseConfig.aws.region,
      credentials: {
        accessKeyId: baseConfig.aws.accessKeyId,
        secretAccessKey: baseConfig.aws.secretAccessKey,
      }
    });

    this.cloudFrontClient = new CloudFrontClient({
      region: baseConfig.aws.region,
      credentials: {
        accessKeyId: baseConfig.aws.accessKeyId,
        secretAccessKey: baseConfig.aws.secretAccessKey,
      }
    });

    this.staticBucket = baseConfig.aws.s3.staticBucket;
    this.distributionId = baseConfig.aws.cloudfront.distributionId;
    this.cdnDomain = baseConfig.aws.cloudfront.domain;
  }

  /**
   * Upload static asset to S3
   */
  async uploadStaticAsset(fileBuffer, fileName, options = {}) {
    try {
      const {
        contentType = mime.lookup(fileName) || 'application/octet-stream',
        folder = 'assets',
        cacheControl = this.getCacheControlForFile(fileName),
        isPublic = true
      } = options;

      const key = this.generateAssetKey(fileName, folder);
      const metadata = this.generateMetadata(fileName, options);

      const uploadParams = {
        Bucket: this.staticBucket,
        Key: key,
        Body: fileBuffer,
        ContentType: contentType,
        CacheControl: cacheControl,
        Metadata: metadata,
        ...(isPublic && { ACL: 'public-read' }),
      };

      // Add content encoding for compressible files
      if (this.isCompressible(contentType)) {
        uploadParams.ContentEncoding = 'gzip';
      }

      const upload = new Upload({
        client: this.s3Client,
        params: uploadParams,
      });

      upload.on('httpUploadProgress', (progress) => {
        logger.debug(`Upload progress: ${Math.round((progress.loaded / progress.total) * 100)}%`);
      });

      const result = await upload.done();
      
      // Generate CDN URL
      const cdnUrl = this.generateCdnUrl(key);
      
      logger.info(`Static asset uploaded successfully: ${key}`, {
        bucket: this.staticBucket,
        key,
        cdnUrl,
        size: fileBuffer.length
      });

      return {
        key,
        url: result.Location,
        cdnUrl,
        size: fileBuffer.length,
        contentType,
        etag: result.ETag
      };

    } catch (error) {
      logger.error(`Failed to upload static asset: ${error.message}`, {
        fileName,
        error: error.stack
      });
      throw new BusinessException(`Failed to upload static asset: ${error.message}`);
    }
  }

  /**
   * Upload multiple static assets
   */
  async uploadMultipleAssets(files) {
    try {
      const uploadPromises = files.map(file => 
        this.uploadStaticAsset(file.buffer, file.name, file.options)
      );

      const results = await Promise.allSettled(uploadPromises);
      
      const successful = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);

      const failed = results
        .filter(result => result.status === 'rejected')
        .map((result, index) => ({
          file: files[index].name,
          error: result.reason.message
        }));

      logger.info(`Batch upload completed: ${successful.length} successful, ${failed.length} failed`);

      return { successful, failed };

    } catch (error) {
      logger.error(`Batch upload failed: ${error.message}`);
      throw new BusinessException(`Batch upload failed: ${error.message}`);
    }
  }

  /**
   * Generate optimized asset key
   */
  generateAssetKey(fileName, folder = 'assets') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(fileName);
    const name = path.basename(fileName, ext);
    const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').toLowerCase();
    
    return `${folder}/${safeName}-${timestamp}-${random}${ext}`;
  }

  /**
   * Get appropriate cache control for file type
   */
  getCacheControlForFile(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    
    const cacheRules = {
      // Long cache for assets with versioning
      '.css': 'public, max-age=31536000, immutable', // 1 year
      '.js': 'public, max-age=31536000, immutable',
      '.woff': 'public, max-age=31536000, immutable',
      '.woff2': 'public, max-age=31536000, immutable',
      '.ttf': 'public, max-age=31536000, immutable',
      
      // Medium cache for images
      '.jpg': 'public, max-age=2592000', // 30 days
      '.jpeg': 'public, max-age=2592000',
      '.png': 'public, max-age=2592000',
      '.svg': 'public, max-age=2592000',
      '.webp': 'public, max-age=2592000',
      '.gif': 'public, max-age=2592000',
      
      // Short cache for HTML
      '.html': 'public, max-age=86400', // 1 day
      '.htm': 'public, max-age=86400',
      
      // No cache for dynamic content
      '.json': 'public, max-age=300', // 5 minutes
      '.xml': 'public, max-age=300',
    };

    return cacheRules[ext] || 'public, max-age=86400'; // Default 1 day
  }

  /**
   * Generate metadata for asset
   */
  generateMetadata(fileName, options) {
    return {
      'uploaded-by': 'school-erp-saas',
      'upload-timestamp': new Date().toISOString(),
      'original-name': fileName,
      'environment': baseConfig.env,
      'version': baseConfig.version || '1.0.0',
      ...(options.metadata || {})
    };
  }

  /**
   * Check if content type is compressible
   */
  isCompressible(contentType) {
    const compressibleTypes = [
      'text/',
      'application/javascript',
      'application/json',
      'application/xml',
      'image/svg+xml'
    ];
    
    return compressibleTypes.some(type => contentType.includes(type));
  }

  /**
   * Generate CDN URL
   */
  generateCdnUrl(key) {
    if (this.cdnDomain) {
      return `https://${this.cdnDomain}/${key}`;
    }
    return `https://${this.staticBucket}.s3.${baseConfig.aws.region}.amazonaws.com/${key}`;
  }

  /**
   * Invalidate CloudFront cache
   */
  async invalidateCache(paths) {
    if (!this.distributionId) {
      logger.warn('CloudFront distribution ID not configured, skipping cache invalidation');
      return;
    }

    try {
      const command = new CreateInvalidationCommand({
        DistributionId: this.distributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: paths.length,
            Items: paths.map(path => `/${path}`),
          },
          CallerReference: `invalidation-${Date.now()}`,
        },
      });

      const result = await this.cloudFrontClient.send(command);
      
      logger.info(`CloudFront cache invalidation initiated`, {
        distributionId: this.distributionId,
        invalidationId: result.Invalidation.Id,
        paths
      });

      return result.Invalidation;

    } catch (error) {
      logger.error(`Failed to invalidate CloudFront cache: ${error.message}`);
      throw new BusinessException(`Cache invalidation failed: ${error.message}`);
    }
  }

  /**
   * Delete static asset
   */
  async deleteStaticAsset(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.staticBucket,
        Key: key,
      });

      await this.s3Client.send(command);
      
      // Invalidate cache for deleted asset
      await this.invalidateCache([key]);
      
      logger.info(`Static asset deleted successfully: ${key}`);
      
      return { deleted: true, key };

    } catch (error) {
      logger.error(`Failed to delete static asset: ${error.message}`, { key });
      throw new BusinessException(`Failed to delete static asset: ${error.message}`);
    }
  }

  /**
   * Copy asset to different location
   */
  async copyAsset(sourceKey, destinationKey) {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.staticBucket,
        CopySource: `${this.staticBucket}/${sourceKey}`,
        Key: destinationKey,
        ACL: 'public-read',
      });

      const result = await this.s3Client.send(command);
      
      logger.info(`Asset copied successfully: ${sourceKey} -> ${destinationKey}`);
      
      return {
        sourceKey,
        destinationKey,
        cdnUrl: this.generateCdnUrl(destinationKey),
        etag: result.CopyObjectResult.ETag
      };

    } catch (error) {
      logger.error(`Failed to copy asset: ${error.message}`, {
        sourceKey,
        destinationKey
      });
      throw new BusinessException(`Failed to copy asset: ${error.message}`);
    }
  }

  /**
   * Generate signed URL for temporary access
   */
  async generateSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.staticBucket,
        Key: key,
      });

      const url = await getSignedUrl(this.s3Client, command, { expiresIn });
      
      logger.debug(`Generated signed URL for: ${key}`);
      
      return url;

    } catch (error) {
      logger.error(`Failed to generate signed URL: ${error.message}`, { key });
      throw new BusinessException(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Get asset metadata
   */
  async getAssetInfo(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.staticBucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      
      return {
        key,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        lastModified: response.LastModified,
        etag: response.ETag,
        cacheControl: response.CacheControl,
        metadata: response.Metadata,
        cdnUrl: this.generateCdnUrl(key)
      };

    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return null;
      }
      logger.error(`Failed to get asset info: ${error.message}`, { key });
      throw new BusinessException(`Failed to get asset info: ${error.message}`);
    }
  }
}

export default new EnhancedS3Service();
