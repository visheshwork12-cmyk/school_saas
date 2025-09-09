import * as Sentry from '@sentry/node';
import { BaseException } from './base.exception.js';

/**
 * Sentry-aware exception that automatically captures itself
 */
export class SentryAwareException extends BaseException {
  constructor(message, code, status = 500, context = {}) {
    super(message, code, status);
    
    // Capture in Sentry immediately
    Sentry.withScope((scope) => {
      scope.setLevel(status >= 500 ? 'error' : 'warning');
      scope.setTag('exception.type', this.constructor.name);
      scope.setTag('exception.code', code);
      
      if (context) {
        scope.setContext('exception_context', context);
      }
      
      Sentry.captureException(this);
    });
  }
}

/**
 * Business logic exception with tenant context
 */
export class BusinessException extends SentryAwareException {
  constructor(message, code, status = 400, tenantContext = {}) {
    super(message, code, status, { business: true, ...tenantContext });
  }
}

/**
 * Subscription-related exception
 */
export class SubscriptionException extends SentryAwareException {
  constructor(message, subscriptionDetails = {}) {
    super(message, 'SUBSCRIPTION_ERROR', 402, { 
      subscription: subscriptionDetails,
      business_critical: true 
    });
  }
}
