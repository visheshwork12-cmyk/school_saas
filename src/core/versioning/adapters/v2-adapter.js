// src/core/versioning/adapters/v2-adapter.js

import { BaseAdapter } from '#core/versioning/adapters/base-adapter.js';
import { FeatureToggleService } from '#core/versioning/services/feature-toggle.service.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Adapter for v2.x clients.
 * Applies v2 enhancements and transformations.
 * 
 * @example
 * const adapter = new V2Adapter(version, context);
 * const transformed = await adapter.transform(data);
 */
class V2Adapter extends BaseAdapter {
  /**
   * @description Core transformation for v2.
   * @param {any} data - Data.
   * @param {Object} context - Context.
   * @returns {Promise<any>} Transformed data.
   */
  async transformCore(data, context) {
    if (Array.isArray(data)) {
      return await Promise.all(data.map(item => this.enhanceV2Item(item, context)));
    } else if (typeof data === 'object') {
      return await this.enhanceV2Item(data, context);
    }
    return data;
  }

  /**
   * @description Enhances item with v2 features.
   * @param {Object} item - Item.
   * @param {Object} context - Context.
   * @returns {Promise<Object>} Enhanced item.
   * @private
   */
  async enhanceV2Item(item, context) {
    const enhanced = { ...item };

    if (await FeatureToggleService.isFeatureEnabled('ANALYTICS', context)) {
      enhanced.analytics = this.generateAnalytics(item, context); // Assume method
    }

    if (await FeatureToggleService.isFeatureEnabled('AI_INSIGHTS', context)) {
      enhanced.aiInsights = this.generateAIInsights(item, context); // Assume method
    }

    enhanced.metadata = {
      lastModified: item.updatedAt,
      version: '2.0',
      source: 'school-erp-v2'
    };

    logger.debug(`v2 enhancements applied`);

    return enhanced;
  }

  /**
   * @description Formats v2 response with metadata.
   * @param {any} data - Data.
   * @param {Object} context - Context.
   * @returns {Object} Formatted response.
   */
  formatResponse(data, context) {
    return {
      success: true,
      data,
      meta: {
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        requestId: context.requestId,
        totalCount: Array.isArray(data) ? data.length : 1,
        processing_time_ms: context.processingTime,
        features: context.enabledFeatures || []
      }
    };
  }
}

export { V2Adapter };