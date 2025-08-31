// src/core/subscription/services/subscription-lifecycle.service.js

import { SubscriptionModel } from "#domain/models/platform/subscription.model.js";
import { OrganizationRepository } from "#core/repositories/platform/organization.repository.js";
import { BusinessException } from "#exceptions/business.exception.js"; // Assume exists
import { logger } from "#utils/core/logger.js";
import config from "#config/index.js";
import moment from "moment";

/**
 * @description Service for managing subscription lifecycle.
 * Handles creation, upgrade, suspension, etc.
 *
 * @example
 * await subscriptionLifecycle.createTrial(orgId);
 */
class SubscriptionLifecycleService {
  constructor() {
    this.orgRepo = new OrganizationRepository();
  }

  /**
   * @description Creates trial subscription.
   * @param {string} orgId - Organization ID.
   * @returns {Promise<Object>} Subscription.
   */
  async createTrial(orgId) {
    try {
      const trialEnd = moment().add(
        config.subscription.defaultTrialDays,
        "days",
      );

      const subscription = await SubscriptionModel.create({
        organizationId: orgId,
        planId: "TRIAL",
        status: "TRIAL",
        currentPeriod: { start: new Date(), end: trialEnd.toDate() },
        features: config.subscription.trialFeatures,
        limits: config.subscription.trialLimits,
        trial: {
          isActive: true,
          startDate: new Date(),
          endDate: trialEnd.toDate(),
        },
      });

      // Update organization
      await this.orgRepo.updateSubscription(orgId, subscription._id);

      logger.info(`Trial subscription created for org: ${orgId}`);

      return subscription;
    } catch (err) {
      logger.error(`Trial creation failed: ${err.message}`);
      throw new BusinessException("Trial creation failed");
    }
  }

  /**
   * @description Upgrades subscription plan.
   * @param {string} orgId - Organization ID.
   * @param {string} newPlan - New plan.
   * @returns {Promise<Object>} Updated subscription.
   */
  async upgrade(_orgId, _newPlan) {
    // Implement logic: validate payment, update plan, features, limits
    // ...
  }

  // Add more: suspend, reactivate, checkExpiry, etc.
}

const subscriptionLifecycle = new SubscriptionLifecycleService();

export { SubscriptionLifecycleService, subscriptionLifecycle };
