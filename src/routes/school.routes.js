import { Router } from 'express';
import authRoutes from '#api/v1/school/auth/routes/auth.routes.js';
import { schoolContextMiddleware } from '#shared/middleware/tenant/school-context.middleware.js';
import { subscriptionGate } from '#shared/middleware/access-control/subscription-gate.middleware.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Router for school-level endpoints
 * @returns {import('express').Router}
 */
const schoolRoutes = Router();

// Apply school context and subscription gate
schoolRoutes.use('/:schoolId', schoolContextMiddleware, subscriptionGate('SCHOOL_ACCESS'));

// Authentication routes
schoolRoutes.use('/:schoolId/auth', authRoutes);

// Placeholder for future routes
// schoolRoutes.use('/:schoolId/academic', academicRoutes);
// schoolRoutes.use('/:schoolId/finance', financeRoutes);

schoolRoutes.use((req, res, next) => {
  logger.debug(`School route accessed: ${req.path}`, { schoolId: req.params.schoolId });
  next();
});

export default schoolRoutes;