import os from 'os';
import { createClient } from 'redis';
import { catchAsync } from '#utils/core/catchAsync.js';
import mongoose from 'mongoose';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { AuditService } from '#core/audit/services/audit-log.service.js'; // Assume exists
import HTTP_STATUS from '#constants/http-status.js';

/**
 * @description Controller for system health checks
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Next function
 */
const getSystemHealth = catchAsync(async (req, res, next) => {
  let redisStatus = 'disconnected';
  if (baseConfig.redis.url) {
    const redisClient = createClient({ url: baseConfig.redis.url });
    try {
      await redisClient.connect();
      redisStatus = 'connected';
      await redisClient.quit();
    } catch (error) {
      logger.warn(`Redis health check failed: ${error.message}`);
    }
  }

  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: baseConfig.env,
    version: baseConfig.versioning.currentApiVersion,
    memory: {
      total: os.totalmem(),
      free: os.freemem(),
      used: process.memoryUsage(),
    },
    cpu: {
      load: os.loadavg(),
      cores: os.cpus().length,
    },
    database: {
      status: dbStatus,
      name: mongoose.connection.name || 'unknown',
    },
    redis: {
      status: redisStatus,
      url: baseConfig.redis.url,
    },
    platform: os.platform(),
    nodeVersion: process.version,
  };

  // Set overall status
  if (dbStatus !== 'connected' || redisStatus !== 'connected') {
    health.status = 'degraded';
  }

  const statusCode = health.status === 'healthy' ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;

  await AuditService.log('SYSTEM_HEALTH_CHECK', {
    status: health.status,
    requestId: req.requestId,
    tenantId: req.context?.tenantId,
  });

  logger.info('System health checked', { status: health.status });

  res.status(statusCode).json(health);
});

export { getSystemHealth };