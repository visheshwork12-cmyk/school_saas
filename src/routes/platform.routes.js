import { Router } from "express";
import systemHealthRoutes from "#api/v1/platform/superadmin/routes/system-health.routes.js"; // Assume exists
import { subscriptionGate } from "#shared/middleware/access-control/subscription-gate.middleware.js";
import { permissionService } from "#core/rbac/services/permission.service.js";
import { logger } from "#utils/core/logger.js";
import ROLES from "#domain/enums/roles.enum.js";

/**
 * @description Router for platform-level endpoints
 * @returns {import('express').Router}
 */
const platformRoutes = Router();

/**
 * @description Middleware to check superadmin access
 */
const superadminMiddleware = async (req, res, next) => {
  try {
    await permissionService.hasAccess(req.user, "platform", "manage", {
      role: ROLES.SUPER_ADMIN,
    });
    next();
  } catch (err) {
    next(err);
  }
};

// Platform routes with superadmin access
platformRoutes.use(
  "/superadmin",
  superadminMiddleware,
  subscriptionGate("PLATFORM_ADMIN"),
);

// System health routes
platformRoutes.use("/superadmin/system-health", systemHealthRoutes);

platformRoutes.use((req, res, next) => {
  logger.debug(`Platform route accessed: ${req.path}`, {
    tenantId: req.tenant?.tenantId,
  });
  next();
});

export default platformRoutes;
