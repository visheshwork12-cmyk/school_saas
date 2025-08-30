import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import xss from 'xss-clean';
import hpp from 'hpp';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { HTTP_STATUS } from '#constants/http-status.js';

/**
 * @description Creates security middleware stack
 * @param {Object} config - Application configuration
 * @returns {Array<import('express').RequestHandler>} Middleware array
 */
const createSecurityMiddleware = (config) => {
  const middlewares = [];

  // Enhanced Helmet configuration
  middlewares.push(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          connectSrc: ["'self'"],
          manifestSrc: ["'self'"],
          mediaSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'none'"],
          workerSrc: ["'self'"],
          upgradeInsecureRequests: config.env === 'production' ? [] : null,
        },
      },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // Enhanced rate limiting with different tiers
  const createRateLimiter = (windowMs, max, message, keyPrefix = '') => {
    return rateLimit({
      windowMs,
      max,
      message: {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message,
        },
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) =>
        `${keyPrefix}${req.context?.tenantId || 'default'}:${req.ip}:${req.get('User-Agent') || 'unknown'}`,
      handler: async (req, res, next, options) => {
        await AuditService.log('RATE_LIMIT_HIT', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method,
          tenantId: req.context?.tenantId,
        });
        res.status(options.statusCode).json(options.message);
      },
    });
  };

  // Route-specific rate limiters
  middlewares.push(createRateLimiter(15 * 60 * 1000, 5, 'Too many login attempts', 'login:'));
  middlewares.push(createRateLimiter(60 * 60 * 1000, 3, 'Too many registration attempts', 'register:'));
  middlewares.push(createRateLimiter(config.rateLimit.windowMs, config.rateLimit.max, 'Too many requests'));

  // Data sanitization
  middlewares.push(mongoSanitize());
  middlewares.push(xss());
  middlewares.push(hpp());

  return middlewares;
};

export { createSecurityMiddleware };