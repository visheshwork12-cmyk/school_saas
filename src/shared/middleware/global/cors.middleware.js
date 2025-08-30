// src/shared/middleware/global/cors.middleware.js

import cors from 'cors';
import config from '#config/index.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Custom CORS middleware configuration for security.
 * Allows origins based on environment config.
 * 
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object.
 * @param {express.NextFunction} next - The next middleware function.
 * 
 * @example
 * app.use(corsMiddleware);
 */
const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = config.cors.allowedOrigins || ['*']; // From config, e.g., ['https://example.com']
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: config.cors.methods || 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204,
  maxAge: 86400, // Performance: Cache preflight for 24 hours
});

export { corsMiddleware };