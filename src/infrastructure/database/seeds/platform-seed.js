// src/infrastructure/database/seeds/platform-seed.js

import { OrganizationModel } from "#domain/models/platform/organization.model.js";
import { SubscriptionModel } from "#domain/models/platform/subscription.model.js";
import { logger } from "#utils/core/logger.js";
import ROLES from "#domain/enums/roles.enum.js";

/**
 * @description Seeds default platform data.
 * Creates default organization, subscription plans, admin user.
 *
 * @example
 * await runSeed();
 */
const runSeed = async () => {
  try {
    // Default subscription plans
    const plans = [
      {
        id: "BASIC",
        features: ["ACADEMIC", "ATTENDANCE"],
        limits: { students: 100, teachers: 10, storage: 1 },
      },
      // Add more
    ];

    // Create default organization
    const defaultOrg = await OrganizationModel.create({
      name: "Default Org",
      tenantId: "default",
    });

    // Create subscriptions
    for (const plan of plans) {
      await SubscriptionModel.create({
        organizationId: defaultOrg._id,
        planId: plan.id,
        features: plan.features,
        limits: plan.limits,
      });
    }

    // Default admin user
    // ...

    logger.info("Platform seed completed");
  } catch (err) {
    logger.error(`Seed failed: ${err.message}`);
    throw err;
  }
};

export { runSeed };
