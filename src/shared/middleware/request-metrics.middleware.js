// src/shared/middleware/monitoring/request-metrics.middleware.js
import { cloudWatchService } from '#core/monitoring/services/cloudwatch.service.js';
import { logger } from '#utils/core/logger.js';

export const requestMetricsMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const originalSend = res.send;

  // Track request start
  req.metricsContext = {
    startTime,
    endpoint: req.route?.path || req.path,
    method: req.method,
    tenantId: req.context?.tenantId,
  };

  // Override res.send to capture response
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Track metrics asynchronously
    setImmediate(async () => {
      try {
        await cloudWatchService.trackResponseTime(
          req.metricsContext.endpoint,
          responseTime,
          statusCode,
          req.metricsContext.tenantId
        );

        // Track slow requests
        if (responseTime > 2000) { // 2 seconds threshold
          await cloudWatchService.putMetricData('SlowRequest', 1, 'Count', [
            { Name: 'Endpoint', Value: req.metricsContext.endpoint },
            { Name: 'Method', Value: req.metricsContext.method },
            { Name: 'ResponseTime', Value: responseTime.toString() },
          ]);
        }

        // Track error responses
        if (statusCode >= 400) {
          await cloudWatchService.trackErrorRate(
            statusCode >= 500 ? 'ServerError' : 'ClientError',
            req.metricsContext.endpoint,
            req.metricsContext.tenantId
          );
        }
      } catch (error) {
        logger.error('Failed to track request metrics', {
          error: error.message,
          endpoint: req.metricsContext.endpoint,
        });
      }
    });

    return originalSend.call(this, data);
  };

  next();
};
