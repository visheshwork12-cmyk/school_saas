import { Router } from 'express';
import { logger } from '#utils/core/logger.js';
import { tenantMiddleware } from '#core/tenant/middleware/tenant.middleware.js';
import { versionAdapterMiddleware } from '#core/versioning/middleware/version-adapter.middleware.js';
import { responseVersionMiddleware } from '#core/versioning/middleware/response-version.middleware.js';
import platformRoutes from './platform.routes.js';
import schoolRoutes from '#routes/school.routes.js';
import productsRoutes from '#routes/products.routes.js';
import sharedRoutes from '#routes/shared.routes.js';
import { AuditService } from '#core/audit/services/audit-log.service.js'; // Assume exists
import HTTP_STATUS from '#constants/http-status.js';
import baseConfig from '#shared/config/environments/base.config.js';

/**
 * @description Main API routes aggregator
 * @returns {import('express').Router}
 */
const apiRoutes = Router();

// Apply middleware
apiRoutes.use(tenantMiddleware);
apiRoutes.use(versionAdapterMiddleware);
apiRoutes.use(responseVersionMiddleware);

// Route logging
apiRoutes.use(async (req, res, next) => {
  await AuditService.log('API_ROUTE_ACCESSED', {
    requestId: req.requestId,
    path: req.path,
    tenantId: req.context?.tenantId,
  });
  logger.debug(`API route accessed: ${req.path}`);
  next();
});

// Route mounting
apiRoutes.use('/platform', platformRoutes);
apiRoutes.use('/school', schoolRoutes);
apiRoutes.use('/products', productsRoutes);
apiRoutes.use('/shared', sharedRoutes);

// API health check
apiRoutes.get('/health', async (req, res) => {
  await AuditService.log('HEALTH_CHECK', {
    requestId: req.requestId,
    tenantId: req.context?.tenantId,
  });
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: 'API is healthy',
    timestamp: new Date().toISOString(),
    version: baseConfig.versioning.currentApiVersion,
  });
});

logger.info('API routes configured successfully');

export default apiRoutes;