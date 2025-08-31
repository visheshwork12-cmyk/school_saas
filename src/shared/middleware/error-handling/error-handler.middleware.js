// src/shared/middleware/error-handling/error-handler.middleware.js

import { logger } from "#utils/core/logger.js";
import config from "#config/index.js";

/**
 * @description Global error handler middleware for production-level error tracking.
 * Handles errors, logs them, and sends appropriate responses.
 *
 * @param {Error} err - The error object.
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object.
 * @param {express.NextFunction} next - The next middleware function.
 *
 * @example
 * app.use(errorHandler);
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  // Log error with details for audit and monitoring
  logger.error(
    `Error: ${message} | Path: ${req.path} | Method: ${req.method} | IP: ${req.ip} | Stack: ${err.stack}`,
  );

  // Production error tracking (integrate with Sentry/Datadog if configured)
  if (config.env === "production") {
    // Example: sentry.captureException(err);
  }

  // Send response
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || "SERVER_ERROR",
      message: config.env === "production" ? "Something went wrong" : message, // Hide details in prod
      ...(config.env !== "production" && { stack: err.stack }), // Dev only
    },
  });
};

export { errorHandler };
