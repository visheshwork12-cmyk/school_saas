// src/api/v1/shared/files/controllers/static-assets.controller.js
import { catchAsync } from '#utils/core/catchAsync.js';
import enhancedS3Service from '#infrastructure/external/storage/enhanced-s3.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import HTTP_STATUS from '#constants/http-status.js';
import { logger } from '#utils/core/logger.js';

/**
 * Static Assets Controller
 */
export class StaticAssetsController {
  /**
   * Upload single static asset
   */
  uploadAsset = catchAsync(async (req, res) => {
    if (!req.file) {
      throw new BusinessException('No file provided', HTTP_STATUS.BAD_REQUEST);
    }

    const { folder = 'assets', isPublic = 'true' } = req.body;
    
    const result = await enhancedS3Service.uploadStaticAsset(
      req.file.buffer,
      req.file.originalname,
      {
        folder,
        isPublic: isPublic === 'true',
        metadata: {
          uploadedBy: req.user?.id || 'system',
          tenantId: req.context?.tenantId || 'default'
        }
      }
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Static asset uploaded successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Upload multiple static assets
   */
  uploadMultipleAssets = catchAsync(async (req, res) => {
    if (!req.files || req.files.length === 0) {
      throw new BusinessException('No files provided', HTTP_STATUS.BAD_REQUEST);
    }

    const { folder = 'assets', isPublic = 'true' } = req.body;
    
    const files = req.files.map(file => ({
      buffer: file.buffer,
      name: file.originalname,
      options: {
        folder,
        isPublic: isPublic === 'true',
        metadata: {
          uploadedBy: req.user?.id || 'system',
          tenantId: req.context?.tenantId || 'default'
        }
      }
    }));

    const result = await enhancedS3Service.uploadMultipleAssets(files);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: `Batch upload completed: ${result.successful.length} successful, ${result.failed.length} failed`,
      data: result,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Delete static asset
   */
  deleteAsset = catchAsync(async (req, res) => {
    const { key } = req.params;
    
    if (!key) {
      throw new BusinessException('Asset key is required', HTTP_STATUS.BAD_REQUEST);
    }

    const result = await enhancedS3Service.deleteStaticAsset(key);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Static asset deleted successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Get asset information
   */
  getAssetInfo = catchAsync(async (req, res) => {
    const { key } = req.params;
    
    if (!key) {
      throw new BusinessException('Asset key is required', HTTP_STATUS.BAD_REQUEST);
    }

    const result = await enhancedS3Service.getAssetInfo(key);
    
    if (!result) {
      throw new BusinessException('Asset not found', HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Asset information retrieved successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Copy asset
   */
  copyAsset = catchAsync(async (req, res) => {
    const { sourceKey } = req.params;
    const { destinationKey, destinationFolder } = req.body;
    
    if (!sourceKey) {
      throw new BusinessException('Source key is required', HTTP_STATUS.BAD_REQUEST);
    }

    let finalDestinationKey = destinationKey;
    if (!finalDestinationKey && destinationFolder) {
      const fileName = sourceKey.split('/').pop();
      finalDestinationKey = `${destinationFolder}/${fileName}`;
    }

    if (!finalDestinationKey) {
      throw new BusinessException('Destination key or folder is required', HTTP_STATUS.BAD_REQUEST);
    }

    const result = await enhancedS3Service.copyAsset(sourceKey, finalDestinationKey);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Asset copied successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Generate signed URL
   */
  generateSignedUrl = catchAsync(async (req, res) => {
    const { key } = req.params;
    const { expiresIn = 3600 } = req.query;
    
    if (!key) {
      throw new BusinessException('Asset key is required', HTTP_STATUS.BAD_REQUEST);
    }

    const url = await enhancedS3Service.generateSignedUrl(key, parseInt(expiresIn));

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Signed URL generated successfully',
      data: { url, expiresIn: parseInt(expiresIn) },
      timestamp: new Date().toISOString()
    });
  });

  /**
   * Invalidate CloudFront cache
   */
  invalidateCache = catchAsync(async (req, res) => {
    const { paths } = req.body;
    
    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      throw new BusinessException('Paths array is required', HTTP_STATUS.BAD_REQUEST);
    }

    const result = await enhancedS3Service.invalidateCache(paths);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Cache invalidation initiated successfully',
      data: result,
      timestamp: new Date().toISOString()
    });
  });
}

export default new StaticAssetsController();
