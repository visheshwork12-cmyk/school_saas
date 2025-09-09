import * as Sentry from '@sentry/node';
import { logger } from '#utils/core/logger.js';

/**
 * Middleware to set Sentry context for multi-tenant requests
 */
export const sentryContextMiddleware = (req, res, next) => {
  try {
    Sentry.configureScope((scope) => {
      // Request context
      scope.setTag('method', req.method);
      scope.setTag('route', req.route?.path || req.path);
      scope.setContext('request', {
        url: req.url,
        method: req.method,
        headers: {
          'user-agent': req.get('user-agent'),
          'x-forwarded-for': req.get('x-forwarded-for'),
          'content-type': req.get('content-type'),
        },
        query: req.query,
        ip: req.ip,
      });

      // Tenant context (if available)
      if (req.context?.tenantId) {
        scope.setTag('tenant', req.context.tenantId);
        scope.setContext('tenant', {
          tenantId: req.context.tenantId,
          organizationId: req.context.tenant?.organizationId,
          schoolName: req.context.tenant?.name,
          subscription: req.context.tenant?.subscription,
        });
      }

      // User context (if available)
      if (req.user) {
        scope.setUser({
          id: req.user._id?.toString(),
          email: req.user.auth?.email,
          username: req.user.personalInfo?.displayName,
        });
        
        scope.setTag('user.role', req.user.role);
        scope.setContext('user', {
          id: req.user._id?.toString(),
          role: req.user.role,
          status: req.user.status,
          tenantId: req.user.tenantId,
          lastActiveAt: req.user.lastActiveAt,
        });
      }

      // Session context (if available)
      if (req.session) {
        scope.setContext('session', {
          id: req.sessionID,
          isAuthenticated: req.session.isAuthenticated,
        });
      }

      // API version context
      if (req.headers['api-version'] || req.path.includes('/v1/')) {
        const version = req.headers['api-version'] || 'v1';
        scope.setTag('api.version', version);
      }

      // Request ID for tracking
      if (req.id) {
        scope.setTag('request.id', req.id);
        scope.setContext('request_meta', {
          id: req.id,
          timestamp: new Date().toISOString(),
        });
      }
    });
  } catch (error) {
    logger.error('Error setting Sentry context:', error);
  }
  
  next();
};

/**
 * Middleware to capture business-specific context
 */
export const businessContextMiddleware = (req, res, next) => {
  try {
    Sentry.configureScope((scope) => {
      // Product context based on route
      const route = req.route?.path || req.path;
      
      if (route.includes('/academic/')) {
        scope.setTag('product.module', 'academic');
      } else if (route.includes('/finance/')) {
        scope.setTag('product.module', 'finance');
      } else if (route.includes('/hr/')) {
        scope.setTag('product.module', 'hr');
      } else if (route.includes('/library/')) {
        scope.setTag('product.module', 'library');
      } else if (route.includes('/transport/')) {
        scope.setTag('product.module', 'transport');
      } else if (route.includes('/platform/')) {
        scope.setTag('product.module', 'platform');
      }

      // Subscription context
      if (req.context?.tenant?.subscription) {
        const subscription = req.context.tenant.subscription;
        scope.setTag('subscription.status', subscription.status);
        scope.setTag('subscription.plan', subscription.planId);
        
        scope.setContext('subscription', {
          status: subscription.status,
          plan: subscription.planId,
          features: subscription.features,
          expiresAt: subscription.endDate,
        });
      }
    });
  } catch (error) {
    logger.error('Error setting business context:', error);
  }
  
  next();
};
