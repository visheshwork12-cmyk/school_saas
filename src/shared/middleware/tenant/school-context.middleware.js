// src/shared/middleware/tenant/school-context.middleware.js

import { catchAsync } from '#utils/core/catchAsync.js';
import SchoolModel from '#domain/models/school/school.model.js'; // Assume exists
import { AuthenticationException } from '#exceptions/authentication.exception.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Middleware to resolve school context within tenant.
 * Validates school ID against organization.
 * 
 * @param {import('express').Request} req - Request.
 * @param {import('express').Response} res - Response.
 * @param {import('express').NextFunction} next - Next.
 */
const schoolContextMiddleware = catchAsync(async (req, res, next) => {
  const { schoolId } = req.params || req.body || req.query;
  const { organizationId } = req.tenant;

  if (!schoolId) {
    throw new AuthenticationException('School ID required');
  }

  const school = await SchoolModel.findOne({ _id: schoolId, organizationId, isDeleted: false });

  if (!school) {
    throw new AuthenticationException('Invalid school in tenant');
  }

  // Extend tenant context
  req.tenant.schoolId = schoolId;
  req.tenant.school = school;

  logger.info(`School context resolved: ${schoolId} for tenant ${req.tenant.tenantId}`);

  next();
});

export { schoolContextMiddleware };