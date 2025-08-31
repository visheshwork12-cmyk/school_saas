// src/core/versioning/adapters/v1-adapter.js

import { BaseAdapter } from "#core/versioning/adapters/base-adapter.js";
import { logger } from "#utils/core/logger.js";

/**
 * @description Adapter for v1.x clients.
 * Applies v1-specific transformations.
 *
 * @example
 * const adapter = new V1Adapter(version, context);
 * const transformed = await adapter.transform(data);
 */
class V1Adapter extends BaseAdapter {
  /**
   * @description Core transformation for v1.
   * @param {any} data - Data.
   * @param {Object} context - Context.
   * @returns {Promise<any>} Transformed data.
   */
  async transformCore(data, _context) {
    if (Array.isArray(data)) {
      return data.map((item) => this.normalizeV1Fields(item));
    } else if (typeof data === "object") {
      return this.normalizeV1Fields(data);
    }
    return data;
  }

  /**
   * @description Normalizes fields to v1 format.
   * @param {Object} item - Item.
   * @returns {Object} Normalized item.
   * @private
   */
  normalizeV1Fields(item) {
    const mapping = {
      studentsCount: "student_count",
      teachersCount: "teacher_count",
      createdAt: "created_at",
      updatedAt: "updated_at",
    };

    const normalized = {};
    Object.keys(item).forEach((key) => {
      const v1Key = mapping[key] || key.toLowerCase();
      normalized[v1Key] = item[key];
    });

    // Remove v2+ fields
    delete normalized.metadata;
    delete normalized.analytics;
    delete normalized.aiInsights;

    logger.debug(`v1 normalization applied`);

    return normalized;
  }

  /**
   * @description Formats v1 response.
   * @param {any} data - Data.
   * @param {Object} context - Context.
   * @returns {Object} Formatted response.
   */
  formatResponse(data, context) {
    return {
      success: true,
      data,
      message: context.message || "Operation successful",
    };
  }
}

export { V1Adapter };
