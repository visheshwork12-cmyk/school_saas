// src/shared/middleware/error-handling/error-handler.middleware.js - SENTRY ENHANCED
import * as Sentry from '@sentry/node';
import { logger } from '#utils/core/logger.js';
import config from '#config/index.js';

/**
 * Enhanced error handler with Sentry integration
 */
export const errorHandler = (error, req, res, next) => {
  // Log the error
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    tenantId: req.context?.tenantId,
    userId: req.user?._id,
    requestId: req.requestId,
  });

  // ✅ Capture in Sentry with enhanced context
  Sentry.withScope((scope) => {
    // Set error context
    scope.setContext('error_details', {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.status || error.statusCode,
      stack: error.stack,
    });

    // Set business context
    if (req.context?.tenantId) {
      scope.setTag('affected_tenant', req.context.tenantId);
      scope.setContext('business_impact', {
        tenantId: req.context.tenantId,
        schoolName: req.context.tenant?.name,
        userCount: req.context.tenant?.stats?.totalUsers,
        subscriptionStatus: req.context.tenant?.subscription?.status,
      });
    }

    // Set severity based on error type
    if (error.status >= 500) {
      scope.setLevel('error');
    } else if (error.status >= 400) {
      scope.setLevel('warning');
    } else {
      scope.setLevel('info');
    }

    // Add error fingerprinting for better grouping
    scope.setFingerprint([
      error.name,
      error.message?.replace(/\d+/g, 'XXX'), // Replace numbers for better grouping
      req.route?.path || req.url,
    ]);

    Sentry.captureException(error);
  });

  // Determine response
  const isDev = config.env === 'development';
  const status = error.status || error.statusCode || 500;
  
  const response = {
    success: false,
    error: {
      message: status >= 500 && !isDev ? 'Internal Server Error' : error.message,
      code: error.code || 'INTERNAL_ERROR',
      ...(isDev && { stack: error.stack }),
    },
    ...(req.requestId && { requestId: req.requestId }),
    timestamp: new Date().toISOString(),
  };

  res.status(status).json(response);
};
