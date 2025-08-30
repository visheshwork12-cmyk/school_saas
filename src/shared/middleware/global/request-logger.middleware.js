// src/shared/middleware/global/request-logger.middleware.js

import { logger } from '#utils/core/logger.js';
import onFinished from 'on-finished';

/**
 * @description Middleware for logging requests and responses.
 * Logs IP, method, path, status, response time, size.
 * 
 * @param {import('express').Request} req - Request object.
 * @param {import('express').Response} res - Response object.
 * @param {import('express').NextFunction} next - Next function.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();

  onFinished(res, () => {
    const duration = Date.now() - start;
    const size = res.get('Content-Length') || 0;

    logger.info(
      `Request: ${req.method} ${req.path} | IP: ${req.ip} | User-Agent: ${req.get('User-Agent')} | Status: ${res.statusCode} | Time: ${duration}ms | Size: ${size} bytes`
    );
  });

  next();
};

export { requestLogger };