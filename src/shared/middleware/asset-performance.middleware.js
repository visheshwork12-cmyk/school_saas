// src/shared/middleware/asset-performance.middleware.js
import { MetricsService } from '#core/monitoring/services/metrics.service.js';

export const assetPerformanceMiddleware = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    if (req.path.startsWith('/api/v1/files/')) {
      const duration = Date.now() - startTime;
      const isCloudFront = req.headers['x-edge-location'] ? true : false;
      
      MetricsService.recordAssetRequest({
        path: req.path,
        method: req.method,
        statusCode: res.statusCode,
        duration,
        isCloudFront,
        userAgent: req.get('User-Agent')
      });
    }
  });

  next();
};
