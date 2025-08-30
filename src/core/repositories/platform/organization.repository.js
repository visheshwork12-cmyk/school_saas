// src/core/repositories/platform/organization.repository.js

import { BaseRepository } from '#core/repositories/base/base.repository.js';
import OrganizationModel from '#domain/models/platform/organization.model.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Repository for organization data access.
 * Extends BaseRepository with multi-tenant methods.
 * 
 * @example
 * const org = await orgRepo.findByTenantId(tenantId);
 */
class OrganizationRepository extends BaseRepository {
  constructor() {
    super(OrganizationModel);
  }

  /**
   * @description Finds organization by tenant ID.
   * @param {string} tenantId - Tenant ID.
   * @returns {Promise<Object|null>} Organization.
   */
  async findByTenantId(tenantId) {
    return this.model.findOne({ tenantId, isDeleted: false });
  }

  /**
   * @description Updates subscription for organization.
   * @param {string} orgId - Org ID.
   * @param {string} subscriptionId - Subscription ID.
   * @returns {Promise<Object|null>} Updated org.
   */
  async updateSubscription(orgId, subscriptionId) {
    return this.update(orgId, { subscriptionId });
  }

  // Add more: createWithSubscription, getSubscriptionDetails, etc.
}

const organizationRepository = new OrganizationRepository();

export { OrganizationRepository, organizationRepository };