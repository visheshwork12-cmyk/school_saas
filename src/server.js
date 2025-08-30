// src/server.js - Production-ready hybrid server entry point
import { createServer } from 'http';
import cluster from 'cluster';
import os from 'os';

import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { connectDatabase, disconnectDatabase } from '#shared/database/connection-manager.js';
import { CacheService } from '#core/cache/services/unified-cache.service.js';
import { JWTManager } from '#core/auth/jwt-manager.js';
import { HealthService } from '#core/monitoring/services/health.service.js';
import { MetricsService } from '#core/monitoring/services/metrics.service.js';
import createApp from './app.js';

// Global process state
let isShuttingDown = false;
let server = null;

/**
 * Initialize core services (shared between serverless and traditional)
 */
async function initializeCoreServices() {
  try {
    logger.info('🔄 Initializing core services...', {
      environment: baseConfig.env,
      nodeVersion: process.version
    });

    // Connect to database
    logger.info('📊 Establishing database connection...');
    const defaultTenantId = baseConfig.multiTenant?.defaultTenantId || 'default';
    await connectDatabase(baseConfig, defaultTenantId);
    logger.info('✅ Database connection established');

    // Initialize cache service
    logger.info('💾 Initializing cache service...');
    await CacheService.initialize(baseConfig);
    logger.info('✅ Cache service initialized');

    // Configure JWT manager
    logger.info('🔐 Configuring JWT manager...');
    JWTManager.configure(baseConfig);
    logger.info('✅ JWT manager configured');

    // Initialize monitoring services
    if (baseConfig.features?.enableMetrics) {
      logger.info('📈 Initializing metrics service...');
      await MetricsService.initialize();
      logger.info('✅ Metrics service initialized');
    }

    if (baseConfig.features?.enableHealthChecks) {
      logger.info('🏥 Initializing health service...');
      await HealthService.initialize();
      logger.info('✅ Health service initialized');
    }

    logger.info('🎉 All core services initialized successfully');
    return { defaultTenantId };

  } catch (error) {
    logger.error(`💥 Failed to initialize core services: ${error.message}`, {
      stack: error.stack,
      environment: baseConfig.env
    });
    throw error;
  }
}

/**
 * Start HTTP server with enhanced error handling and monitoring
 */
async function startServer(port = baseConfig.port) {
  try {
    if (isShuttingDown) {
      logger.warn('Server startup aborted - shutdown in progress');
      return;
    }

    // Initialize core services
    const { defaultTenantId } = await initializeCoreServices();

    // Create Express app
    logger.info('🏗️ Creating Express application...');
    const app = await createApp();
    logger.info('✅ Express application created');

    // Create HTTP server with enhanced configuration
    server = createServer(app);

    // Configure server timeouts
    server.timeout = baseConfig.server?.timeout || 30000;
    server.keepAliveTimeout = baseConfig.server?.keepAliveTimeout || 65000;
    server.headersTimeout = baseConfig.server?.headersTimeout || 66000;

    // Enhanced server error handling
    server.on('error', async (error) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`🚫 Port ${port} is already in use`);

        if (port < 65535) {
          logger.info(`🔄 Trying alternate port ${port + 1}...`);
          await AuditService.log('SERVER_PORT_CONFLICT', {
            action: 'start_server',
            originalPort: port,
            newPort: port + 1,
            error: error.message,
          }).catch(() => { });

          return startServer(port + 1);
        } else {
          logger.error('No available ports found');
          process.exit(1);
        }
      } else {
        logger.error(`💥 Server error: ${error.message}`, {
          code: error.code,
          stack: error.stack
        });

        await AuditService.log('SERVER_ERROR', {
          action: 'start_server',
          error: error.message,
          code: error.code
        }).catch(() => { });

        process.exit(1);
      }
    });

    // Connection handling
    server.on('connection', (socket) => {
      const { remoteAddress } = socket;
      logger.debug('New connection established', { remoteAddress });

      socket.on('error', (error) => {
        logger.warn('Socket error', {
          remoteAddress,
          error: error.message
        });
      });
    });

    // Server startup
    await new Promise((resolve, reject) => {
      server.listen(port, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    // Success logging
    const serverInfo = {
      port,
      environment: baseConfig.env,
      platform: process.platform,
      nodeVersion: process.version,
      pid: process.pid,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    };

    logger.info('🚀 Server started successfully', serverInfo);
    logger.info(`📍 Server URL: http://localhost:${port}`);
    logger.info(`📚 API Docs: http://localhost:${port}/api-docs`);
    logger.info(`🏥 Health Check: http://localhost:${port}/health`);

    // Audit log server start
    await AuditService.log('SERVER_STARTED', {
      action: 'start_server',
      ...serverInfo,
      deploymentType: 'traditional'
    }).catch((err) => {
      logger.warn(`Failed to audit server start: ${err.message}`);
    });

    return server;

  } catch (error) {
    logger.error(`💥 Failed to start server: ${error.message}`, {
      stack: error.stack,
      port
    });

    await AuditService.log('SERVER_START_FAILED', {
      action: 'start_server',
      port,
      error: error.message,
      stack: error.stack,
    }).catch(() => { });

    process.exit(1);
  }
}

/**
 * Graceful shutdown handling
 */
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress, forcing exit...');
    process.exit(1);
  }

  isShuttingDown = true;
  logger.info(`🛑 Received ${signal}. Starting graceful shutdown...`);

  const shutdownTimeout = baseConfig.server?.gracefulShutdownTimeout || 30000;

  // Force shutdown after timeout
  const forceShutdownTimer = setTimeout(() => {
    logger.error('💥 Graceful shutdown timeout exceeded, forcing exit');
    process.exit(1);
  }, shutdownTimeout);

  try {
    // Stop accepting new connections
    if (server) {
      logger.info('🚪 Closing HTTP server...');
      await new Promise((resolve) => {
        server.close((error) => {
          if (error) {
            logger.error('Error closing server', { error: error.message });
          } else {
            logger.info('✅ HTTP server closed');
          }
          resolve();
        });
      });
    }

    // Shutdown services in reverse order
    logger.info('🔌 Shutting down services...');

    if (baseConfig.features?.enableMetrics) {
      await MetricsService.shutdown().catch(err =>
        logger.warn('Metrics service shutdown error', { error: err.message })
      );
    }

    if (baseConfig.features?.enableHealthChecks) {
      await HealthService.shutdown().catch(err =>
        logger.warn('Health service shutdown error', { error: err.message })
      );
    }

    await CacheService.shutdown().catch(err =>
      logger.warn('Cache service shutdown error', { error: err.message })
    );

    const defaultTenantId = baseConfig.multiTenant?.defaultTenantId || 'default';
    await disconnectDatabase(defaultTenantId).catch(err =>
      logger.warn('Database disconnect error', { error: err.message })
    );

    logger.info('✅ All services shut down successfully');

    // Clear the force shutdown timer
    clearTimeout(forceShutdownTimer);

    // Final audit log
    await AuditService.log('SERVER_SHUTDOWN', {
      action: 'graceful_shutdown',
      signal,
      status: 'success',
      uptime: process.uptime()
    }).catch(() => { });

    logger.info('👋 Graceful shutdown completed');
    process.exit(0);

  } catch (error) {
    logger.error(`💥 Error during graceful shutdown: ${error.message}`, {
      stack: error.stack
    });

    await AuditService.log('SERVER_SHUTDOWN_FAILED', {
      action: 'graceful_shutdown',
      signal,
      error: error.message,
    }).catch(() => { });

    clearTimeout(forceShutdownTimer);
    process.exit(1);
  }
}

/**
 * Create app instance for serverless deployment
 */
export async function createServerlessApp() {
  try {
    logger.info('⚡ Initializing serverless application...', {
      platform: process.env.VERCEL ? 'vercel' :
        process.env.NETLIFY ? 'netlify' :
          process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' : 'unknown',
      environment: process.env.NODE_ENV || 'production'
    });

    // Initialize core services for serverless
    await initializeCoreServices();

    // Create Express app
    const app = await createApp();

    logger.info('✅ Serverless application initialized successfully');

    await AuditService.log('SERVERLESS_APP_INITIALIZED', {
      action: 'create_serverless_app',
      environment: baseConfig.env,
      deploymentType: 'serverless',
      platform: process.env.VERCEL ? 'vercel' :
        process.env.NETLIFY ? 'netlify' :
          process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' : 'unknown'
    }).catch((err) => {
      logger.warn(`Failed to audit serverless app init: ${err.message}`);
    });

    return app;

  } catch (error) {
    logger.error(`💥 Failed to create serverless app: ${error.message}`, {
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Start clustered server for production
 */
async function startClusteredServer() {
  const numCPUs = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;

  if (cluster.isPrimary) {
    logger.info(`🏭 Starting cluster with ${numCPUs} workers...`);

    // Fork workers
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      logger.warn(`👷 Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
      cluster.fork();
    });

    // Handle cluster shutdown
    process.on('SIGTERM', () => {
      logger.info('🏭 Shutting down cluster...');
      for (const id in cluster.workers) {
        cluster.workers[id].kill();
      }
    });

  } else {
    // Worker process
    await startServer();
    logger.info(`👷 Worker ${process.pid} started`);
  }
}

// Enhanced process error handling
process.on('uncaughtException', async (error) => {
  logger.error(`💥 Uncaught Exception: ${error.message}`, {
    stack: error.stack,
    pid: process.pid
  });

  await AuditService.log('UNCAUGHT_EXCEPTION', {
    action: 'system_error',
    error: error.message,
    stack: error.stack,
    pid: process.pid
  }).catch(() => { });

  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  logger.error(`💥 Unhandled Promise Rejection`, {
    reason: reason?.message || reason?.toString() || 'Unknown',
    stack: reason?.stack,
    promise: promise.toString(),
    pid: process.pid
  });

  await AuditService.log('UNHANDLED_REJECTION', {
    action: 'system_error',
    reason: reason?.message || reason?.toString() || 'Unknown',
    stack: reason?.stack,
    pid: process.pid
  }).catch(() => { });

  process.exit(1);
});

/**
 * Create optimized app instance for serverless deployment
 */
export async function createServerlessApp() {
  try {
    logger.info('⚡ Initializing serverless application...', {
      platform: process.env.VERCEL ? 'vercel' :
        process.env.NETLIFY ? 'netlify' :
          process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' : 'unknown',
      environment: process.env.NODE_ENV || 'production'
    });

    // Use serverless-optimized connection
    const { connectToDatabase } = await import('#shared/database/serverless-connection.js');

    // Initialize serverless-specific core services
    const defaultTenantId = baseConfig.multiTenant?.defaultTenantId || 'default';

    // Connect to database with serverless optimization
    await connectToDatabase(baseConfig, defaultTenantId);
    logger.info('✅ Serverless database connected');

    // Initialize cache service (memory-only for serverless)
    if (baseConfig.cache?.strategy === 'redis' && process.env.REDIS_URL) {
      try {
        await CacheService.initialize(baseConfig);
        logger.info('✅ Cache service initialized');
      } catch (cacheError) {
        logger.warn('Cache initialization failed, falling back to memory cache', {
          error: cacheError.message
        });
        // Continue without Redis cache
      }
    }

    // Configure JWT manager
    JWTManager.configure(baseConfig);
    logger.info('✅ JWT manager configured');

    // Create Express app
    const app = await createApp();
    logger.info('✅ Serverless Express app created');

    // Audit logging
    await AuditService.log('SERVERLESS_APP_INITIALIZED', {
      action: 'create_serverless_app',
      environment: baseConfig.env,
      deploymentType: 'serverless',
      platform: process.env.VERCEL ? 'vercel' :
        process.env.NETLIFY ? 'netlify' :
          process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' : 'unknown'
    }).catch((err) => {
      logger.warn(`Failed to audit serverless app init: ${err.message}`);
    });

    return app;

  } catch (error) {
    logger.error(`💥 Failed to create serverless app: ${error.message}`, {
      stack: error.stack
    });
    throw error;
  }
}

// Keep the existing createServerlessApp function as well for compatibility
// ... rest of the existing code remains the same


// Register graceful shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // Nodemon restart

// 🔸 DEPLOYMENT TYPE DETECTION & STARTUP
const deploymentType = process.env.DEPLOYMENT_TYPE || 'traditional';
const isServerless = deploymentType === 'serverless' ||
  process.env.VERCEL ||
  process.env.NETLIFY ||
  process.env.AWS_LAMBDA_FUNCTION_NAME;

// Only start server if not in serverless mode and not in test environment
if (!isServerless && process.env.NODE_ENV !== 'test') {
  const enableClustering = baseConfig.clustering?.enabled &&
    process.env.NODE_ENV === 'production' &&
    !process.env.DISABLE_CLUSTERING;

  if (enableClustering) {
    logger.info('🏭 Starting clustered server...');
    startClusteredServer();
  } else {
    logger.info('🏗️ Starting traditional server...');
    startServer();
  }
} else if (isServerless) {
  logger.info('⚡ Serverless mode detected - server startup skipped');
} else {
  logger.info('🧪 Test mode detected - server startup skipped');
}

// Export functions for different deployment scenarios
export {
  startServer,
  initializeCoreServices,
  gracefulShutdown,
  startClusteredServer
};
