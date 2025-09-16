// src/api/v1/shared/files/controllers/asset-url.controller.js
import { cloudFrontAssetService } from '../services/cloudfront-asset.service.js';
import { catchAsync } from '#shared/utils/core/catchAsync.js';
import HTTP_STATUS from '#shared/constants/http-status.js';

export const getAssetUrl = catchAsync(async (req, res) => {
  const { 
    publicId,
    width,
    height,
    quality,
    format,
    crop,
    gravity,
    useCloudFront = 'true'
  } = req.query;

  const { tenantId } = req.context;

  if (!publicId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: 'publicId is required'
    });
  }

  const assetUrl = cloudFrontAssetService.getAssetUrl(publicId, {
    tenantId,
    width: width ? parseInt(width) : undefined,
    height: height ? parseInt(height) : undefined,
    quality,
    format,
    crop,
    gravity,
    useCloudFront: useCloudFront === 'true'
  });

  if (!assetUrl) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      error: 'Asset not found or invalid'
    });
  }

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      assetUrl,
      publicId,
      optimized: true,
      cloudFrontEnabled: cloudFrontAssetService.cloudFront.enabled
    }
  });
});

export const getResponsiveUrls = catchAsync(async (req, res) => {
  const { publicId, breakpoints } = req.query;
  const { tenantId } = req.context;

  if (!publicId) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: 'publicId is required'
    });
  }

  const parsedBreakpoints = breakpoints 
    ? breakpoints.split(',').map(bp => parseInt(bp.trim()))
    : undefined;

  const responsiveUrls = cloudFrontAssetService.getResponsiveUrls(
    publicId, 
    tenantId, 
    parsedBreakpoints
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: {
      publicId,
      responsiveUrls,
      srcSet: Object.entries(responsiveUrls)
        .map(([size, url]) => `${url} ${size}`)
        .join(', ')
    }
  });
});
