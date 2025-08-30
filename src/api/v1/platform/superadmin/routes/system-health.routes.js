// src/api/v1/platform/superadmin/routes/system-health.routes.js

import { Router } from 'express';
import { catchAsync } from '#utils/core/catchAsync.js';
import { getSystemHealth } from '#api/v1/platform/superadmin/controllers/system-health.controller.js';
import { authGuard } from '#core/auth/guards/auth.guard.js';
import { roleGuard } from '#core/auth/guards/role.guard.js'; // Assume for superadmin role

/**
 * @description Routes for system health in superadmin.
 * @returns {express.Router} The router instance.
 */
const systemHealthRoutes = Router();

// Apply guards: auth and superadmin role
systemHealthRoutes.use(authGuard);
systemHealthRoutes.use(roleGuard('superadmin'));

systemHealthRoutes.get('/', catchAsync(getSystemHealth));

export default systemHealthRoutes;