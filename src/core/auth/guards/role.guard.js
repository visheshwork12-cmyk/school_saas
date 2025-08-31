import catchAsync from "#utils/core/catchAsync.js";
import { logger } from "#utils/core/logger.js";
import { AuthenticationException } from "#shared/exceptions/authentication.exception.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { TenantService } from "#core/tenant/services/tenant.service.js";
// import  HTTP_STATUS }from '#constants/http-status.js';
import ROLES from "#domain/enums/roles.enum.js"; // Assume exists
// import baseConfig from '#shared/config/environments/base.config.js';

/**
 * @description Middleware for role-based access control
 * @param {string|string[]} requiredRoles - Required role(s) for access
 * @returns {Function} Express middleware
 */
const roleGuard = (requiredRoles) =>
  catchAsync(async (req, res, next) => {
    try {
      // Ensure user is authenticated
      if (!req.user || !req.user._id) {
        throw new AuthenticationException("User not authenticated", {
          requestId: req.requestId,
        });
      }

      // Ensure tenant context is set
      if (!req.context?.tenantId) {
        throw new AuthenticationException("Tenant context missing", {
          requestId: req.requestId,
        });
      }

      // Validate tenant
      const tenant = await TenantService.validateTenant(req.context.tenantId, {
        requestId: req.requestId,
        userId: req.user._id,
      });

      // Check user role
      const userRoles = req.user.roles || [];
      const hasRequiredRole = Array.isArray(requiredRoles)
        ? requiredRoles.some((role) => userRoles.includes(role))
        : userRoles.includes(requiredRoles);

      if (!hasRequiredRole) {
        throw new AuthenticationException(
          `Access denied: Requires one of [${[].concat(requiredRoles).join(", ")}] role(s)`,
          { userId: req.user._id, tenantId: req.context.tenantId },
        );
      }

      // Check subscription plan for role-based features
      if (
        !tenant.subscription?.plan ||
        !isPlanAuthorized(tenant.subscription.plan, requiredRoles)
      ) {
        throw new AuthenticationException(
          `Insufficient subscription plan for role: ${requiredRoles}`,
          { tenantId: req.context.tenantId, plan: tenant.subscription.plan },
        );
      }

      // Log successful access
      await AuditService.log(
        "ROLE_ACCESS_GRANTED",
        {
          action: "access_route",
          requiredRoles: [].concat(requiredRoles),
          userId: req.user._id,
          path: req.path,
        },
        {
          tenantId: req.context.tenantId,
          userId: req.user._id,
          requestId: req.requestId,
        },
      );

      logger.debug(`Role access granted: ${req.user._id}`, {
        roles: userRoles,
        tenantId: req.context.tenantId,
      });
      next();
    } catch (error) {
      logger.error(`Role guard failed: ${error.message}`, {
        userId: req.user?._id,
        tenantId: req.context?.tenantId,
        requiredRoles,
      });
      await AuditService.log(
        "ROLE_ACCESS_DENIED",
        {
          action: "access_route",
          requiredRoles: [].concat(requiredRoles),
          error: error.message,
        },
        {
          tenantId: req.context?.tenantId,
          userId: req.user?._id,
          requestId: req.requestId,
        },
      );
      next(error);
    }
  });

/**
 * @description Checks if subscription plan allows role-based access
 * @param {string} plan - Subscription plan
 * @param {string|string[]} requiredRoles - Required role(s)
 * @returns {boolean} Whether plan is authorized
 * @private
 */
function isPlanAuthorized(plan, requiredRoles) {
  const roleRequirements = {
    [ROLES.SUPER_ADMIN]: ["PREMIUM"],
    [ROLES.ADMIN]: ["BASIC", "PREMIUM"],
    [ROLES.TEACHER]: ["TRIAL", "BASIC", "PREMIUM"],
    [ROLES.STUDENT]: ["TRIAL", "BASIC", "PREMIUM"],
  };

  const roles = [].concat(requiredRoles);
  return roles.every((role) => {
    const allowedPlans = roleRequirements[role] || [];
    return allowedPlans.includes(plan);
  });
}

export { roleGuard };
