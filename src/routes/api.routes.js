// src/routes/api.routes.js - COMPLETE FIXED VERSION
import { Router } from "express";
import { logger } from "#utils/core/logger.js";
import { tenantMiddleware } from "#core/tenant/middleware/tenant.middleware.js";
import { versionAdapterMiddleware } from "#core/versioning/middleware/version-adapter.middleware.js";
import { responseVersionMiddleware } from "#core/versioning/middleware/response-version.middleware.js";
import platformRoutes from "./platform.routes.js";
import schoolRoutes from "#routes/school.routes.js";
import productsRoutes from "#routes/products.routes.js";
import apiDocsRoutes from "./api-docs.routes.js";
import sharedRoutes from "#routes/shared.routes.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import HTTP_STATUS from "#constants/http-status.js";
import baseConfig from "#shared/config/environments/base.config.js";
import testSentryRoutes from './test-sentry.routes.js';

// ✅ CRITICAL FIX: Import file routes
import filesRoutes from '../api/v1/shared/files/routes/files.routes.js';

const apiRoutes = Router();

// Apply middleware
apiRoutes.use(tenantMiddleware);
apiRoutes.use(versionAdapterMiddleware);
apiRoutes.use(responseVersionMiddleware);

// Route logging
apiRoutes.use(async (req, res, next) => {
  try {
    await AuditService.log("API_ROUTE_ACCESSED", {
      requestId: req.requestId,
      path: req.path,
      tenantId: req.context?.tenantId,
    });
  } catch (error) {
    // Continue if audit fails
  }
  logger.debug(`API route accessed: ${req.path}`);
  next();
});

// ✅ CRITICAL FIX: Mount file routes FIRST
apiRoutes.use('/files', filesRoutes);

// Route mounting
apiRoutes.use("/platform", platformRoutes);
apiRoutes.use('/', apiDocsRoutes);
apiRoutes.use('/test', testSentryRoutes);
apiRoutes.use("/school", schoolRoutes);
apiRoutes.use("/products", productsRoutes);
apiRoutes.use("/shared", sharedRoutes);

// API health check
apiRoutes.get("/health", async (req, res) => {
  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "API is healthy",
    timestamp: new Date().toISOString(),
    version: baseConfig.versioning.currentApiVersion,
  });
});

logger.info("✅ API routes configured successfully");

export default apiRoutes;
