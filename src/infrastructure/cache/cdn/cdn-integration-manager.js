// src/infrastructure/cache/cdn/cdn-integration-manager.js
import { logger } from "#utils/core/logger.js";
import AWS from "aws-sdk";
import path from "path";
import fs from "fs/promises";
import crypto from "crypto";

/**
 * CDN Integration Manager
 * Manages static asset caching and distribution via CloudFront CDN
 */
export class CDNIntegrationManager {
  constructor() {
    this.cloudFront = new AWS.CloudFront({
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });

    this.s3 = new AWS.S3({
      region: process.env.AWS_REGION || 'us-east-1',
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    });

    this.config = {
      distributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
      bucketName: process.env.S3_ASSETS_BUCKET,
      cdnDomain: process.env.CDN_DOMAIN,
      defaultCacheDuration: 31536000, // 1 year for static assets
      shortCacheDuration: 300, // 5 minutes for dynamic content
      assetPrefixes: {
        images: 'assets/images/',
        css: 'assets/css/',
        js: 'assets/js/',
        fonts: 'assets/fonts/',
        documents: 'documents/'
      },
      cacheHeaders: {
        images: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        css: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        js: { 'Cache-Control': 'public, max-age=31536000, immutable' },
        fonts: { 'Cache-Control': 'public, max-age=31536000, crossorigin' },
        documents: { 'Cache-Control': 'public, max-age=3600' }
      }
    };

    this.assetCache = new Map(); // Local asset URL cache
  }

  /**
   * Upload static asset to S3 and invalidate CDN
   */
  async uploadAsset(filePath, assetType, options = {}) {
    try {
      const fileName = path.basename(filePath);
      const fileExtension = path.extname(fileName);
      const assetKey = this.generateAssetKey(fileName, assetType, options);

      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const fileHash = this.calculateFileHash(fileBuffer);

      // Check if file already exists with same hash
      const existingAsset = await this.getAssetMetadata(assetKey);
      if (existingAsset && existingAsset.hash === fileHash) {
        logger.info(`Asset unchanged, skipping upload: ${assetKey}`);
        return this.getAssetURL(assetKey);
      }

      // Prepare S3 upload parameters
      const uploadParams = {
        Bucket: this.config.bucketName,
        Key: assetKey,
        Body: fileBuffer,
        ContentType: this.getContentType(fileExtension),
        CacheControl: this.getCacheControl(assetType),
        Metadata: {
          originalName: fileName,
          assetType,
          hash: fileHash,
          uploadedAt: new Date().toISOString()
        }
      };

      // Add compression if supported
      if (this.shouldCompress(fileExtension)) {
        uploadParams.ContentEncoding = 'gzip';
        uploadParams.Body = await this.compressFile(fileBuffer);
      }

      // Upload to S3
      const uploadResult = await this.s3.upload(uploadParams).promise();
      
      // Invalidate CDN cache for this asset
      await this.invalidateCDNCache([assetKey]);

      // Cache asset URL locally
      const assetURL = this.getAssetURL(assetKey);
      this.assetCache.set(assetKey, {
        url: assetURL,
        hash: fileHash,
        uploadedAt: new Date(),
        s3Key: assetKey,
        s3Location: uploadResult.Location
      });

      logger.info(`Asset uploaded successfully: ${assetKey} -> ${assetURL}`);
      
      return assetURL;

    } catch (error) {
      logger.error(`Failed to upload asset ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Upload multiple assets in batch
   */
  async uploadAssetBatch(assets, options = {}) {
    const results = [];
    const batchSize = options.batchSize || 10;
    
    for (let i = 0; i < assets.length; i += batchSize) {
      const batch = assets.slice(i, i + batchSize);
      const batchPromises = batch.map(asset => 
        this.uploadAsset(asset.filePath, asset.assetType, asset.options)
      );

      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        logger.info(`Batch upload completed: ${batchResults.length} assets`);
      } catch (error) {
        logger.error(`Batch upload failed for batch starting at index ${i}:`, error);
      }
    }

    // Perform bulk CDN invalidation
    if (results.length > 0) {
      await this.invalidateCDNCache(['/*']); // Invalidate all for bulk upload
    }

    return results;
  }

  /**
   * Generate versioned asset URLs
   */
  generateVersionedURL(assetKey, version = null) {
    const baseURL = this.getAssetURL(assetKey);
    
    if (!version) {
      // Use file hash as version if available
      const cachedAsset = this.assetCache.get(assetKey);
      version = cachedAsset ? cachedAsset.hash.substring(0, 8) : Date.now();
    }

    return `${baseURL}?v=${version}`;
  }

  /**
   * Get asset URL from CDN
   */
  getAssetURL(assetKey) {
    return `https://${this.config.cdnDomain}/${assetKey}`;
  }

  /**
   * Invalidate CDN cache
   */
  async invalidateCDNCache(paths) {
    try {
      if (!this.config.distributionId) {
        logger.warn('CDN distribution ID not configured, skipping invalidation');
        return;
      }

      const invalidationParams = {
        DistributionId: this.config.distributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: paths.length,
            Items: paths.map(path => path.startsWith('/') ? path : `/${path}`)
          },
          CallerReference: `invalidation-${Date.now()}-${Math.random()}`
        }
      };

      const result = await this.cloudFront.createInvalidation(invalidationParams).promise();
      
      logger.info(`CDN cache invalidation initiated: ${result.Invalidation.Id}`, {
        paths,
        status: result.Invalidation.Status
      });

      return result.Invalidation.Id;

    } catch (error) {
      logger.error('CDN cache invalidation failed:', error);
      throw error;
    }
  }

  /**
   * Set up CDN caching rules
   */
  async setupCachingRules() {
    try {
      const cachingRules = [
        {
          pathPattern: '/assets/images/*',
          cacheDuration: this.config.defaultCacheDuration,
          compress: true,
          headers: ['Accept-Encoding', 'Origin']
        },
        {
          pathPattern: '/assets/css/*',
          cacheDuration: this.config.defaultCacheDuration,
          compress: true,
          headers: ['Accept-Encoding']
        },
        {
          pathPattern: '/assets/js/*',
          cacheDuration: this.config.defaultCacheDuration,
          compress: true,
          headers: ['Accept-Encoding']
        },
        {
          pathPattern: '/api/*',
          cacheDuration: 0, // No caching for API responses
          headers: ['Authorization', 'Content-Type', 'X-Tenant-ID']
        },
        {
          pathPattern: '/documents/*',
          cacheDuration: 3600, // 1 hour for documents
          headers: ['Authorization', 'Range']
        }
      ];

      logger.info('CDN caching rules configured', { rulesCount: cachingRules.length });
      return cachingRules;

    } catch (error) {
      logger.error('Failed to setup CDN caching rules:', error);
      throw error;
    }
  }

  /**
   * Monitor CDN performance
   */
  async getCDNMetrics(startTime, endTime) {
    try {
      const cloudWatch = new AWS.CloudWatch({
        region: process.env.AWS_REGION || 'us-east-1'
      });

      const metricsParams = {
        Namespace: 'AWS/CloudFront',
        MetricName: 'Requests',
        Dimensions: [
          {
            Name: 'DistributionId',
            Value: this.config.distributionId
          }
        ],
        StartTime: startTime,
        EndTime: endTime,
        Period: 3600, // 1 hour periods
        Statistics: ['Sum', 'Average']
      };

      const metrics = await cloudWatch.getMetricStatistics(metricsParams).promise();

      const performanceMetrics = {
        totalRequests: metrics.Datapoints.reduce((sum, point) => sum + point.Sum, 0),
        averageRequests: metrics.Datapoints.length > 0 
          ? metrics.Datapoints.reduce((sum, point) => sum + point.Average, 0) / metrics.Datapoints.length 
          : 0,
        period: { startTime, endTime },
        dataPoints: metrics.Datapoints.length
      };

      // Get cache hit ratio
      const cacheMetrics = await this.getCacheHitRatio(startTime, endTime);
      performanceMetrics.cacheHitRatio = cacheMetrics.hitRatio;

      return performanceMetrics;

    } catch (error) {
      logger.error('Failed to get CDN metrics:', error);
      throw error;
    }
  }

  /**
   * Get cache hit ratio
   */
  async getCacheHitRatio(startTime, endTime) {
    try {
      const cloudWatch = new AWS.CloudWatch({
        region: process.env.AWS_REGION || 'us-east-1'
      });

      const [cacheHits, totalRequests] = await Promise.all([
        cloudWatch.getMetricStatistics({
          Namespace: 'AWS/CloudFront',
          MetricName: 'CacheHitRate',
          Dimensions: [{ Name: 'DistributionId', Value: this.config.distributionId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600,
          Statistics: ['Average']
        }).promise(),
        cloudWatch.getMetricStatistics({
          Namespace: 'AWS/CloudFront',
          MetricName: 'Requests',
          Dimensions: [{ Name: 'DistributionId', Value: this.config.distributionId }],
          StartTime: startTime,
          EndTime: endTime,
          Period: 3600,
          Statistics: ['Sum']
        }).promise()
      ]);

      const hitRatio = cacheHits.Datapoints.length > 0
        ? cacheHits.Datapoints.reduce((sum, point) => sum + point.Average, 0) / cacheHits.Datapoints.length
        : 0;

      const totalReqs = totalRequests.Datapoints.reduce((sum, point) => sum + point.Sum, 0);

      return {
        hitRatio: hitRatio * 100, // Convert to percentage
        totalRequests: totalReqs,
        period: { startTime, endTime }
      };

    } catch (error) {
      logger.error('Failed to get cache hit ratio:', error);
      return { hitRatio: 0, totalRequests: 0 };
    }
  }

  /**
   * Optimize images for CDN delivery
   */
  async optimizeImageForCDN(imagePath, options = {}) {
    const optimizationOptions = {
      quality: options.quality || 85,
      format: options.format || 'webp',
      responsive: options.responsive || true,
      ...options
    };

    try {
      // Generate multiple sizes for responsive images
      if (optimizationOptions.responsive) {
        const sizes = [320, 640, 1024, 1920];
        const optimizedImages = [];

        for (const size of sizes) {
          const optimizedPath = await this.resizeAndOptimizeImage(
            imagePath, 
            size, 
            optimizationOptions
          );
          
          const assetURL = await this.uploadAsset(optimizedPath, 'images', {
            suffix: `_${size}w`
          });
          
          optimizedImages.push({
            size,
            url: assetURL,
            descriptor: `${size}w`
          });
        }

        return {
          original: await this.uploadAsset(imagePath, 'images'),
          optimized: optimizedImages,
          srcset: optimizedImages.map(img => `${img.url} ${img.descriptor}`).join(', ')
        };
      } else {
        // Single optimized image
        const optimizedPath = await this.optimizeSingleImage(imagePath, optimizationOptions);
        return await this.uploadAsset(optimizedPath, 'images');
      }

    } catch (error) {
      logger.error(`Image optimization failed for ${imagePath}:`, error);
      throw error;
    }
  }

  // Helper methods
  generateAssetKey(fileName, assetType, options = {}) {
    const prefix = this.config.assetPrefixes[assetType] || 'assets/';
    const suffix = options.suffix || '';
    const timestamp = options.versioning ? `_${Date.now()}` : '';
    
    const baseName = path.parse(fileName).name;
    const extension = path.parse(fileName).ext;
    
    return `${prefix}${baseName}${suffix}${timestamp}${extension}`;
  }

  calculateFileHash(buffer) {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  getContentType(extension) {
    const mimeTypes = {
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.pdf': 'application/pdf'
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  getCacheControl(assetType) {
    return this.config.cacheHeaders[assetType]?.['Cache-Control'] || 
           'public, max-age=3600';
  }

  shouldCompress(extension) {
    const compressibleTypes = ['.js', '.css', '.svg', '.json', '.html'];
    return compressibleTypes.includes(extension.toLowerCase());
  }

  async compressFile(buffer) {
    // Implement gzip compression
    const zlib = await import('zlib');
    return new Promise((resolve, reject) => {
      zlib.gzip(buffer, (err, compressed) => {
        if (err) reject(err);
        else resolve(compressed);
      });
    });
  }

  async getAssetMetadata(assetKey) {
    try {
      const params = {
        Bucket: this.config.bucketName,
        Key: assetKey
      };

      const result = await this.s3.headObject(params).promise();
      return {
        hash: result.Metadata?.hash,
        lastModified: result.LastModified,
        size: result.ContentLength
      };
    } catch (error) {
      if (error.code === 'NotFound') {
        return null;
      }
      throw error;
    }
  }
}

// Export singleton instance
export const cdnIntegrationManager = new CDNIntegrationManager();
