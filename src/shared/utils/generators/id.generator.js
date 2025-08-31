// src/shared/utils/generators/id.generator.js

import { v4 as uuidv4 } from "uuid";
import { logger } from "#utils/core/logger.js";

/**
 * @description Utility for generating multi-tenant safe IDs.
 * Prefixes IDs with tenant context.
 *
 * @example
 * const tenantId = idGenerator.generateTenantId();
 */
class IdGenerator {
  /**
   * @description Generates tenant ID.
   * @returns {string} Tenant ID like 'org_123456'.
   */
  static generateTenantId() {
    return `org_${uuidv4().slice(0, 8)}`;
  }

  /**
   * @description Generates school ID.
   * @param {string} orgId - Organization ID.
   * @returns {string} School ID.
   */
  static generateSchoolId(orgId) {
    return `school_${orgId.slice(4)}_${uuidv4().slice(0, 8)}`;
  }

  /**
   * @description Validates resource ID against tenant.
   * @param {string} resourceId - Resource ID.
   * @param {Object} tenant - Tenant context.
   * @returns {boolean} Valid.
   */
  static validateTenantAccess(resourceId, tenant) {
    const parts = resourceId.split("_");
    return parts[1] === tenant.organizationId.slice(4);
  }

  // Add more
}

export { IdGenerator };
