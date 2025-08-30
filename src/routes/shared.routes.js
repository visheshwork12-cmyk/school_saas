import { Router } from 'express';
import { logger } from '#utils/core/logger.js';
import { subscriptionGate } from '#shared/middleware/access-control/subscription-gate.middleware.js';

/**
 * @description Router for shared resources
 * @returns {import('express').Router}
 */
const sharedRoutes = Router();

// Apply subscription gate for shared resources
sharedRoutes.use(subscriptionGate('SHARED_ACCESS'));

// Placeholder for shared routes
// sharedRoutes.use('/notifications', notificationRoutes);
// sharedRoutes.use('/reports', reportRoutes);

sharedRoutes.use((req, res, next) => {
  logger.debug(`Shared route accessed: ${req.path}`, { tenantId: req.tenant?.tenantId });
  next();
});

export default sharedRoutes;