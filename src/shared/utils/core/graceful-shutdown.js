import { logger } from "#utils/core/logger.js";
import mongoose from "mongoose";
import { createClient } from "redis";
import { EventEmitter } from "#core/events/emitters/system-event.emitter.js"; // Assume exists
import baseConfig from "#shared/config/environments/base.config.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";

/**
 * @description Graceful shutdown handler for the server
 * @param {http.Server} server - HTTP server instance
 * @returns {Function} Shutdown function
 */
const gracefulShutdown = (server) => {
  return async (signal) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
      // Stop accepting new connections
      server.close(() => {
        logger.info("HTTP server closed");
      });

      // Close MongoDB connection
      await mongoose.connection.close();
      logger.info("MongoDB connections closed");

      // Close Redis connection
      const redisClient = createClient({ url: baseConfig.redis.url });
      await redisClient.quit();
      logger.info("Redis connections closed");

      // Cleanup event emitter
      await EventEmitter.cleanup();
      logger.info("Event emitter cleaned up");

      // Complete audit logging
      await AuditService.log("SERVER_SHUTDOWN", { signal });

      process.exit(0);
    } catch (error) {
      logger.error(`Shutdown error: ${error.message}`);
      await AuditService.log("SERVER_SHUTDOWN_FAILED", {
        signal,
        error: error.message,
      });
      process.exit(1);
    } finally {
      // Force exit after timeout
      setTimeout(() => {
        logger.error("Shutdown timeout exceeded, forcing exit");
        process.exit(1);
      }, baseConfig.server.timeout);
    }
  };
};

export { gracefulShutdown };
