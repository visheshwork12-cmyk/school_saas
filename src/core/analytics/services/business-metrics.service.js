// src/core/analytics/services/business-metrics.service.js
import { cloudWatchService } from '#core/monitoring/services/cloudwatch.service.js';
import { logger } from '#utils/core/logger.js';

class BusinessMetricsService {
  /**
   * Track user registration
   */
  async trackUserRegistration(userType, tenantId, registrationSource = 'direct') {
    try {
      await cloudWatchService.trackBusinessMetric('UserRegistration', 1, [
        { Name: 'UserType', Value: userType },
        { Name: 'TenantId', Value: tenantId },
        { Name: 'Source', Value: registrationSource },
      ]);

      logger.debug('User registration tracked', { userType, tenantId });
    } catch (error) {
      logger.error('Failed to track user registration', { error: error.message });
    }
  }

  /**
   * Track login activities
   */
  async trackUserLogin(userId, tenantId, loginMethod = 'email') {
    try {
      await cloudWatchService.trackUserActivity('Login', userId, tenantId);
      await cloudWatchService.putMetricData('LoginCount', 1, 'Count', [
        { Name: 'Method', Value: loginMethod },
        { Name: 'TenantId', Value: tenantId },
      ]);
    } catch (error) {
      logger.error('Failed to track user login', { error: error.message });
    }
  }

  /**
   * Track subscription changes
   */
  async trackSubscriptionChange(event, fromPlan, toPlan, tenantId) {
    try {
      await cloudWatchService.trackSubscriptionEvent(event, toPlan, tenantId);
      
      if (event === 'upgrade' || event === 'downgrade') {
        await cloudWatchService.putMetricData('PlanChange', 1, 'Count', [
          { Name: 'FromPlan', Value: fromPlan },
          { Name: 'ToPlan', Value: toPlan },
          { Name: 'ChangeType', Value: event },
        ]);
      }
    } catch (error) {
      logger.error('Failed to track subscription change', { error: error.message });
    }
  }

  /**
   * Track academic activities
   */
  async trackAcademicActivity(activity, tenantId, metadata = {}) {
    try {
      const dimensions = [
        { Name: 'Activity', Value: activity },
        { Name: 'TenantId', Value: tenantId },
      ];

      // Add metadata as dimensions
      Object.entries(metadata).forEach(([key, value]) => {
        dimensions.push({ Name: key, Value: String(value) });
      });

      await cloudWatchService.putMetricData('AcademicActivity', 1, 'Count', dimensions);
    } catch (error) {
      logger.error('Failed to track academic activity', { error: error.message });
    }
  }

  /**
   * Track file upload metrics
   */
  async trackFileUpload(fileType, fileSize, tenantId, success = true) {
    try {
      await Promise.all([
        cloudWatchService.putMetricData('FileUpload', 1, 'Count', [
          { Name: 'FileType', Value: fileType },
          { Name: 'Status', Value: success ? 'Success' : 'Failed' },
          { Name: 'TenantId', Value: tenantId },
        ]),
        cloudWatchService.putMetricData('FileUploadSize', fileSize, 'Bytes', [
          { Name: 'FileType', Value: fileType },
          { Name: 'TenantId', Value: tenantId },
        ]),
      ]);
    } catch (error) {
      logger.error('Failed to track file upload', { error: error.message });
    }
  }

  /**
   * Track system resource usage
   */
  async trackResourceUsage(tenantId, resourceType, usage, limit) {
    try {
      const utilizationPercent = limit > 0 ? (usage / limit) * 100 : 0;
      
      await Promise.all([
        cloudWatchService.putMetricData('ResourceUsage', usage, 'Count', [
          { Name: 'ResourceType', Value: resourceType },
          { Name: 'TenantId', Value: tenantId },
        ]),
        cloudWatchService.putMetricData('ResourceUtilization', utilizationPercent, 'Percent', [
          { Name: 'ResourceType', Value: resourceType },
          { Name: 'TenantId', Value: tenantId },
        ]),
      ]);
    } catch (error) {
      logger.error('Failed to track resource usage', { error: error.message });
    }
  }
}

export const businessMetricsService = new BusinessMetricsService();
export default businessMetricsService;
