// src/routes/health.routes.js

import { Router } from 'express';
import { catchAsync } from '#utils/core/catchAsync.js';
import { systemHealthController } from '#api/v1/platform/superadmin/controllers/system-health.controller.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Sets up health check routes for monitoring system health.
 * @returns {express.Router} The health router instance.
 * 
 * @example
 * app.use('/health', healthRoutes);
 */
const healthRoutes = Router();

// Basic health check
healthRoutes.get('/', catchAsync(async (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
}));

// Detailed system health (DB, cache, etc.)
healthRoutes.get('/system', catchAsync(systemHealthController.getSystemHealth));

logger.info('Health routes configured.');

export default healthRoutes;