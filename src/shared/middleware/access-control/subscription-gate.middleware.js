// src/shared/middleware/access-control/subscription-gate.middleware.js

import catchAsync from "#utils/core/catchAsync.js";
import { AuthorizationException } from "#exceptions/authorization.exception.js";
import { logger } from "#utils/core/logger.js";

/**
 * @description Middleware for subscription-based feature gating.
 * Checks if feature is enabled in subscription.
 *
 * @param {string} feature - Required feature.
 * @returns {Function} Middleware.
 *
 * @example
 * router.get('/finance', subscriptionGate('FINANCE'), controller);
 */
const subscriptionGate = (feature) =>
  catchAsync(async (req, res, next) => {
    const { features, status } = req.tenant;

    if (status !== "ACTIVE") {
      throw new AuthorizationException("Subscription not active");
    }

    if (!features.includes(feature)) {
      throw new AuthorizationException(
        `Feature ${feature} not available in plan`,
      );
    }

    // Check usage limits if applicable
    // ...

    logger.info(`Subscription gate passed for feature: ${feature}`);

    next();
  });

export { subscriptionGate };
