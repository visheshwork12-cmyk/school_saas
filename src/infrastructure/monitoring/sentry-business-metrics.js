import * as Sentry from '@sentry/node';
import { logger } from '#utils/core/logger.js';

/**
 * Business metrics tracking with Sentry
 */
export class SentryBusinessMetrics {
  /**
   * Track subscription events
   */
  static trackSubscriptionEvent(event, tenantId, subscriptionData) {
    Sentry.addBreadcrumb({
      category: 'business.subscription',
      message: `Subscription ${event}`,
      level: 'info',
      data: {
        event,
        tenantId,
        planId: subscriptionData.planId,
        status: subscriptionData.status,
      }
    });

    // For critical events, create custom transactions
    if (['created', 'upgraded', 'cancelled', 'expired'].includes(event)) {
      Sentry.startSpan({
        name: `subscription.${event}`,
        op: 'business.subscription',
      }, () => {
        Sentry.setContext('subscription_event', {
          event,
          tenantId,
          subscriptionData,
          timestamp: new Date().toISOString(),
        });
      });
    }
  }

  /**
   * Track user activity metrics
   */
  static trackUserActivity(activity, userId, tenantId, metadata = {}) {
    Sentry.addBreadcrumb({
      category: 'business.user_activity',
      message: `User ${activity}`,
      level: 'info',
      data: {
        activity,
        userId: userId?.toString(),
        tenantId,
        ...metadata,
      }
    });
  }

  /**
   * Track feature usage
   */
  static trackFeatureUsage(feature, tenantId, userId, success = true) {
    const level = success ? 'info' : 'warning';
    
    Sentry.addBreadcrumb({
      category: 'business.feature_usage',
      message: `Feature ${feature} ${success ? 'used' : 'failed'}`,
      level,
      data: {
        feature,
        tenantId,
        userId: userId?.toString(),
        success,
        timestamp: new Date().toISOString(),
      }
    });

    // Track premium feature usage
    const premiumFeatures = ['advanced_reporting', 'bulk_import', 'api_access'];
    if (premiumFeatures.includes(feature)) {
      Sentry.setTag('premium_feature_used', feature);
    }
  }

  /**
   * Track payment events
   */
  static trackPaymentEvent(event, tenantId, amount, currency = 'USD') {
    Sentry.withScope((scope) => {
      scope.setTag('business.payment', event);
      scope.setContext('payment', {
        event,
        tenantId,
        amount,
        currency,
        timestamp: new Date().toISOString(),
      });

      const message = `Payment ${event}: ${currency} ${amount}`;
      if (event === 'failed') {
        Sentry.captureMessage(message, 'warning');
      } else {
        Sentry.captureMessage(message, 'info');
      }
    });
  }

  /**
   * Track system limits and quotas
   */
  static trackQuotaUsage(tenantId, resource, current, limit) {
    const percentage = (current / limit) * 100;
    
    Sentry.addBreadcrumb({
      category: 'business.quota',
      message: `${resource} usage: ${current}/${limit} (${percentage.toFixed(1)}%)`,
      level: percentage > 80 ? 'warning' : 'info',
      data: {
        tenantId,
        resource,
        current,
        limit,
        percentage,
      }
    });

    // Alert when approaching limits
    if (percentage > 90) {
      Sentry.withScope((scope) => {
        scope.setTag('quota.critical', resource);
        scope.setLevel('warning');
        Sentry.captureMessage(`Quota almost exceeded: ${resource} at ${percentage.toFixed(1)}%`);
      });
    }
  }

  /**
   * Track data export/import operations
   */
  static trackDataOperation(operation, tenantId, recordCount, success = true) {
    const span = Sentry.startSpan({
      name: `data.${operation}`,
      op: 'business.data_operation',
    }, () => {
      Sentry.setContext('data_operation', {
        operation,
        tenantId,
        recordCount,
        success,
        timestamp: new Date().toISOString(),
      });
    });

    if (!success) {
      Sentry.captureMessage(`Data ${operation} failed for tenant ${tenantId}`, 'error');
    }
  }
}
