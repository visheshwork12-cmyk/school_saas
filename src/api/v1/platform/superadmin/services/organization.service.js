// src/api/v1/platform/superadmin/services/organization.service.js

import { OrganizationRepository } from "#core/repositories/platform/organization.repository.js";
import { subscriptionLifecycle } from "#core/subscription/services/subscription-lifecycle.service.js";
import { logger } from "#utils/core/logger.js";
import { BusinessException } from "#exceptions/business.exception.js";

/**
 * @description Service for organization management.
 * Handles creation, subscription setup, etc.
 *
 * @example
 * const org = await organizationService.createOrganization(data);
 */
class OrganizationService {
  constructor() {
    this.orgRepo = new OrganizationRepository();
  }

  /**
   * @description Creates new organization with trial subscription.
   * @param {Object} orgData - Organization data.
   * @returns {Promise<Object>} Created organization.
   */
  async createOrganization(orgData) {
    try {
      const organization = await this.orgRepo.create(orgData);

      // Setup trial
      await subscriptionLifecycle.createTrial(organization._id);

      logger.info(`Organization created: ${organization._id}`);

      return organization;
    } catch (err) {
      logger.error(`Organization creation failed: ${err.message}`);
      throw new BusinessException("Organization creation failed");
    }
  }

  // Add more: inviteSchoolAdmin, upgradeSubscription, etc.
}

const organizationService = new OrganizationService();

export { OrganizationService, organizationService };
