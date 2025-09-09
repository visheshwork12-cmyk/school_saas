import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import config from '#config/index.js';
import { logger } from '#utils/core/logger.js';

/**
 * Initialize Sentry with comprehensive configuration
 */
export function initializeSentry() {
  if (!config.sentry?.dsn) {
    logger.warn('Sentry DSN not provided, skipping Sentry initialization');
    return;
  }

  try {
    Sentry.init({
      dsn: config.sentry.dsn,
      environment: config.sentry.environment || config.env,
      release: config.sentry.release || config.app.version,
      
      // Performance Monitoring
      tracesSampleRate: config.sentry.tracesSampleRate || 0.1,
      profilesSampleRate: config.sentry.profilesSampleRate || 0.1,
      
      // Integrations
      integrations: [
        // Profiling
        nodeProfilingIntegration(),
        
        // Database integrations
        Sentry.mongoIntegration({
          operations: ['aggregate', 'bulkWrite', 'countDocuments', 'createIndex', 
                      'deleteMany', 'deleteOne', 'distinct', 'drop', 'dropIndex', 
                      'find', 'findOne', 'findOneAndDelete', 'findOneAndReplace', 
                      'findOneAndUpdate', 'insertMany', 'insertOne', 'replaceOne', 
                      'updateMany', 'updateOne'],
        }),
        
        Sentry.redisIntegration({
          cachePrefixes: ['tenant:', 'session:', 'cache:', 'queue:']
        }),
        
        // HTTP integrations
        Sentry.httpIntegration({
          tracing: true,
          breadcrumbs: true,
          instrumentation: {
            requestHook: (span, request) => {
              // Add custom request context
              span.setData('url.full', request.url);
              span.setData('http.request.method', request.method);
            },
            responseHook: (span, response) => {
              // Add custom response context
              span.setData('http.response.status_code', response.status);
            }
          }
        }),
        
        // Console integration for capturing console.error calls
        Sentry.consoleIntegration(),
        
        // Context lines integration
        Sentry.contextLinesIntegration(),
        
        // Local variables integration
        Sentry.localVariablesIntegration({
          captureAllExceptions: config.env === 'development'
        }),
      ],
      
      // Session tracking
      autoSessionTracking: true,
      
      // Error filtering
      beforeSend(event) {
        // Filter out health check endpoints
        if (event.request?.url?.includes('/health')) {
          return null;
        }
        
        // Filter out certain error types in production
        if (config.env === 'production' && event.exception) {
          const error = event.exception.values;
          if (error?.type === 'ValidationError' && error?.value?.includes('Cast to ObjectId')) {
            return null;
          }
        }
        
        return event;
      },
      
      // Transaction filtering
      beforeSendTransaction(event) {
        // Skip health check transactions
        if (event.transaction === 'GET /health' || event.transaction === 'GET /status') {
          return null;
        }
        
        return event;
      },
      
      // Additional options
      debug: config.sentry.debug || false,
      attachStacktrace: config.sentry.attachStacktrace || true,
      sendDefaultPii: config.sentry.sendDefaultPII || false,
      
      // Max breadcrumbs
      maxBreadcrumbs: 100,
      
      // Release health
      enableTracing: true,
    });

    logger.info('Sentry initialized successfully', {
      environment: config.sentry.environment || config.env,
      release: config.sentry.release || config.app.version,
      tracesSampleRate: config.sentry.tracesSampleRate,
    });

  } catch (error) {
    logger.error('Failed to initialize Sentry:', error);
  }
}

/**
 * Get current Sentry hub
 */
export function getCurrentHub() {
  return Sentry.getCurrentHub();
}

/**
 * Create child span
 */
export function startSpan(name, operation, callback) {
  return Sentry.startSpan({
    name,
    op: operation,
  }, callback);
}

/**
 * Add breadcrumb
 */
export function addBreadcrumb(breadcrumb) {
  Sentry.addBreadcrumb(breadcrumb);
}

/**
 * Capture exception with context
 */
export function captureException(error, context = {}) {
  Sentry.withScope((scope) => {
    Object.keys(context).forEach(key => {
      scope.setContext(key, context[key]);
    });
    Sentry.captureException(error);
  });
}

/**
 * Capture message with context
 */
export function captureMessage(message, level = 'info', context = {}) {
  Sentry.withScope((scope) => {
    Object.keys(context).forEach(key => {
      scope.setContext(key, context[key]);
    });
    Sentry.captureMessage(message, level);
  });
}


export { Sentry };
