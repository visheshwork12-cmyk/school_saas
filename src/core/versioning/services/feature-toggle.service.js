import { logger } from '#utils/core/logger.js';
import { CacheService } from '#core/cache/services/unified-cache.service.js';
import { FeatureFlagModel } from '#domain/models/feature-flag.model.js';
import { AuditService } from '#core/audit/services/audit-log.service.js'; // Assume exists
import baseConfig from '#shared/config/environments/base.config.js';
import { BusinessException } from '#exceptions/business.exception.js';
import semver from 'semver';

/**
 * @description Service for managing feature toggles
 */
class FeatureToggleService {
  /**
   * @description Checks if a feature is enabled for the given context
   * @param {string} feature - Feature name
   * @param {Object} context - Request context (tenantId, clientVersion, subscription)
   * @returns {Promise<boolean>} Whether feature is enabled
   */
  static async isFeatureEnabled(feature, context) {
    try {
      const cacheKey = `feature:${feature}:${context.tenantId || 'default'}`;
      let enabled = await CacheService.get(cacheKey);

      if (enabled === null) {
        const flag = await FeatureFlagModel.findOne({ feature, organizationId: context.tenantId || null });
        enabled = flag?.enabled || false;

        // Apply additional checks
        if (enabled) {
          enabled = this.applyContextChecks(feature, context);
        }

        // Cache result
        await CacheService.set(cacheKey, enabled, baseConfig.featureFlags.cacheTtl, context.tenantId);
      }

      if (!enabled) {
        await AuditService.log('FEATURE_DISABLED', { feature, tenantId: context.tenantId });
        logger.debug(`Feature disabled: ${feature}`, { tenantId: context.tenantId });
      }

      return enabled;
    } catch (error) {
      logger.error(`Feature toggle error: ${error.message}`, { feature });
      throw new BusinessException(`Failed to check feature: ${feature}`);
    }
  }

  /**
   * @description Applies context-specific checks (version, subscription)
   * @param {string} feature - Feature name
   * @param {Object} context - Request context
   * @returns {boolean} Whether feature is allowed
   * @private
   */
  static applyContextChecks(feature, context) {
    const featureRequirements = {
      ANALYTICS: { minVersion: '2.0.0', minPlan: 'BASIC' },
      AI_INSIGHTS: { minVersion: '2.1.0', minPlan: 'PREMIUM' },
      ADVANCED_REPORTS: { minVersion: '2.0.0', minPlan: 'PREMIUM' },
    };

    const reqs = featureRequirements[feature] || {};
    if (reqs.minVersion && context.clientVersion && !semver.satisfies(context.clientVersion, `>=${reqs.minVersion}`)) {
      return false;
    }
    if (reqs.minPlan && context.subscription?.plan !== reqs.minPlan) {
      return false;
    }
    return true;
  }
}

export { FeatureToggleService };