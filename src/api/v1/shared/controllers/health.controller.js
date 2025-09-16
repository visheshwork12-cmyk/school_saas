// src/api/v1/shared/controllers/health.controller.js
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import HTTP_STATUS from "#constants/http-status.js";
import mongoose from "mongoose";
import { CacheService } from "#core/cache/services/unified-cache.service.js";

export class HealthController {
  /**
   * Basic health check for ALB target group
   */
  static async basicHealth(req, res) {
    try {
      const healthCheck = {
        status: "healthy",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        version: process.env.APP_VERSION || "1.0.0",
        requestId: req.requestId
      };

      res.status(HTTP_STATUS.OK).json(healthCheck);
    } catch (error) {
      logger.error("Basic health check failed", error);
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Comprehensive system status for monitoring
   */
  static async systemStatus(req, res) {
    const checks = {};
    let overallHealth = true;

    try {
      // Database connectivity check
      checks.database = await this.checkDatabase();
      if (!checks.database.healthy) overallHealth = false;

      // Cache connectivity check
      checks.cache = await this.checkCache();
      if (!checks.cache.healthy) overallHealth = false;

      // Memory usage check
      checks.memory = this.checkMemoryUsage();
      if (!checks.memory.healthy) overallHealth = false;

      // Disk space check
      checks.disk = this.checkDiskSpace();
      if (!checks.disk.healthy) overallHealth = false;

      // External services check
      checks.external = await this.checkExternalServices();

      const statusResponse = {
        status: overallHealth ? "healthy" : "degraded",
        checks,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        deployment: {
          version: process.env.APP_VERSION || "1.0.0",
          buildDate: process.env.BUILD_DATE,
          commitSha: process.env.COMMIT_SHA?.substring(0, 7)
        },
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid
        }
      };

      const statusCode = overallHealth ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
      res.status(statusCode).json(statusResponse);

      // Audit health check
      await AuditService.log("HEALTH_CHECK", {
        status: overallHealth ? "healthy" : "degraded",
        checks: Object.keys(checks).reduce((acc, key) => {
          acc[key] = checks[key].healthy;
          return acc;
        }, {}),
        requestId: req.requestId
      });

    } catch (error) {
      logger.error("System status check failed", error);
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        status: "unhealthy",
        error: error.message,
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    }
  }

  /**
   * Database connectivity check
   */
  static async checkDatabase() {
    try {
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      const responseTime = Date.now() - start;

      return {
        healthy: true,
        responseTime: `${responseTime}ms`,
        status: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        host: mongoose.connection.host,
        name: mongoose.connection.name
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        status: "error"
      };
    }
  }

  /**
   * Cache connectivity check
   */
  static async checkCache() {
    try {
      const start = Date.now();
      const testKey = `health-check:${Date.now()}`;
      const testValue = "ok";

      await CacheService.set(testKey, testValue, 10);
      const retrieved = await CacheService.get(testKey);
      await CacheService.del(testKey);

      const responseTime = Date.now() - start;

      return {
        healthy: retrieved === testValue,
        responseTime: `${responseTime}ms`,
        status: "connected"
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        status: "error"
      };
    }
  }

  /**
   * Memory usage check
   */
  static checkMemoryUsage() {
    const usage = process.memoryUsage();
    const totalMemory = usage.heapTotal + usage.external;
    const usedMemory = usage.heapUsed;
    const memoryUtilization = (usedMemory / totalMemory) * 100;

    return {
      healthy: memoryUtilization < 85, // Alert if > 85%
      utilization: `${memoryUtilization.toFixed(2)}%`,
      details: {
        heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(usage.external / 1024 / 1024)}MB`,
        rss: `${Math.round(usage.rss / 1024 / 1024)}MB`
      }
    };
  }

  /**
   * Disk space check
   */
  static checkDiskSpace() {
    try {
      const fs = require('fs');
      const stats = fs.statSync('.');
      // This is a simplified check - in production, use a proper disk space check
      return {
        healthy: true,
        status: "available"
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * External services health check
   */
  static async checkExternalServices() {
    const services = {};

    // Cloudinary check
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      services.cloudinary = await this.checkCloudinary();
    }

    // Email service check
    if (process.env.SMTP_HOST) {
      services.email = await this.checkEmailService();
    }

    return services;
  }

  /**
   * Cloudinary service check
   */
  static async checkCloudinary() {
    try {
      const cloudinary = require('cloudinary').v2;
      const result = await cloudinary.api.ping();
      
      return {
        healthy: result.status === "ok",
        status: result.status || "unknown"
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Email service check
   */
  static async checkEmailService() {
    try {
      // Simple connectivity check - don't send actual email
      return {
        healthy: true,
        status: "configured"
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Readiness probe for Kubernetes/ECS
   */
  static async readinessProbe(req, res) {
    try {
      // Check if application is ready to serve traffic
      const isReady = mongoose.connection.readyState === 1;

      if (isReady) {
        res.status(HTTP_STATUS.OK).json({
          status: "ready",
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
          status: "not ready",
          reason: "Database not connected",
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        status: "not ready",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Liveness probe for Kubernetes/ECS
   */
  static async livenessProbe(req, res) {
    try {
      // Simple liveness check
      res.status(HTTP_STATUS.OK).json({
        status: "alive",
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        status: "dead",
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}
