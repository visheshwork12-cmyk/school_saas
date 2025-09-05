// src/routes/health.routes.js
import { Router } from "express";
import catchAsync from "#utils/core/catchAsync.js";
import { logger } from "#utils/core/logger.js";
import HTTP_STATUS from "#constants/http-status.js";

/**
 * @description Sets up health check routes for monitoring system health including Cloudinary
 * @returns {express.Router} The health router instance.
 */
const healthRoutes = Router();

/**
 * @description Check Cloudinary connection
 */
const checkCloudinaryHealth = async () => {
  try {
    const { verifyCloudinaryConnection } = await import("#shared/config/cloudinary.config.js");
    const isConnected = await verifyCloudinaryConnection();
    return {
      status: isConnected ? 'healthy' : 'unhealthy',
      configured: !!process.env.CLOUDINARY_CLOUD_NAME,
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'not-configured'
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message,
      configured: false
    };
  }
};

/**
 * @description Check database health
 */
const checkDatabaseHealth = async () => {
  try {
    // Dynamic import to avoid issues if database is not connected
    const mongoose = await import('mongoose');
    const readyState = mongoose.default.connection.readyState;
    
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    return {
      status: readyState === 1 ? 'healthy' : 'unhealthy',
      state: states[readyState] || 'unknown',
      readyState
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error.message
    };
  }
};

/**
 * @description Basic health check
 */
healthRoutes.get(
  "/",
  catchAsync(async (req, res) => {
    const health = {
      status: "healthy",
      message: "School ERP SaaS is running",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      environment: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      pid: process.pid
    };

    logger.debug('Health check requested', { 
      ip: req.ip, 
      userAgent: req.get('User-Agent') 
    });

    res.status(HTTP_STATUS.OK).json(health);
  })
);

/**
 * @description Detailed system health including all services
 */
healthRoutes.get(
  "/system",
  catchAsync(async (req, res) => {
    logger.info('System health check requested');

    // Check all services in parallel
    const [databaseHealth, cloudinaryHealth] = await Promise.allSettled([
      checkDatabaseHealth(),
      checkCloudinaryHealth()
    ]);

    const systemHealth = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: databaseHealth.status === 'fulfilled' 
          ? databaseHealth.value 
          : { status: 'unhealthy', error: databaseHealth.reason?.message },
        
        cloudinary: cloudinaryHealth.status === 'fulfilled' 
          ? cloudinaryHealth.value 
          : { status: 'unhealthy', error: cloudinaryHealth.reason?.message },
        
        cache: {
          status: 'healthy', // Assuming memory cache is always available
          type: process.env.REDIS_URL ? 'redis' : 'memory'
        },
        
        fileUpload: {
          status: process.env.CLOUDINARY_CLOUD_NAME ? 'healthy' : 'configured',
          provider: 'cloudinary',
          maxFileSize: '10MB',
          allowedTypes: ['image/*', 'application/pdf']
        }
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        memory: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    };

    // Determine overall health status
    const services = Object.values(systemHealth.services);
    const allHealthy = services.every(service => service.status === 'healthy');
    
    if (!allHealthy) {
      systemHealth.status = 'degraded';
    }

    const statusCode = allHealthy ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
    
    res.status(statusCode).json(systemHealth);
  })
);

/**
 * @description Cloudinary specific health check
 */
healthRoutes.get(
  "/cloudinary",
  catchAsync(async (req, res) => {
    logger.info('Cloudinary health check requested');

    const cloudinaryHealth = await checkCloudinaryHealth();
    
    const response = {
      service: 'cloudinary',
      timestamp: new Date().toISOString(),
      ...cloudinaryHealth
    };

    const statusCode = cloudinaryHealth.status === 'healthy' 
      ? HTTP_STATUS.OK 
      : HTTP_STATUS.SERVICE_UNAVAILABLE;

    res.status(statusCode).json(response);
  })
);

/**
 * @description File upload service health check
 */
healthRoutes.get(
  "/files",
  catchAsync(async (req, res) => {
    logger.info('File upload service health check requested');

    const cloudinaryHealth = await checkCloudinaryHealth();
    
    const fileServiceHealth = {
      service: 'file-upload',
      timestamp: new Date().toISOString(),
      status: cloudinaryHealth.status,
      provider: {
        name: 'cloudinary',
        ...cloudinaryHealth
      },
      configuration: {
        maxFileSize: process.env.MAX_FILE_SIZE || '10MB',
        maxFiles: process.env.MAX_FILES || 5,
        allowedTypes: [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf'
        ]
      },
      endpoints: {
        upload: '/api/v1/files/upload/single',
        multipleUpload: '/api/v1/files/upload/multiple',
        delete: '/api/v1/files/:publicId',
        test: '/api/v1/files/test'
      }
    };

    const statusCode = cloudinaryHealth.status === 'healthy' 
      ? HTTP_STATUS.OK 
      : HTTP_STATUS.SERVICE_UNAVAILABLE;

    res.status(statusCode).json(fileServiceHealth);
  })
);

logger.info("Health routes configured with Cloudinary integration.");

export default healthRoutes;
