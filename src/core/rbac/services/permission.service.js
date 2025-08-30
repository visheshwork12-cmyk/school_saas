// src/core/rbac/services/permission.service.js

import { AuthorizationException } from '#exceptions/authorization.exception.js';
import { logger } from '#utils/core/logger.js';
import ROLES from '#domain/enums/roles.enum.js';

/**
 * @description Service for managing role-based permissions.
 * Checks access based on resource, action, and conditions.
 * Supports role hierarchy.
 * 
 * @example
 * if (await permissionService.hasAccess(user, 'students', 'create')) { ... }
 */
class PermissionService {
  // Role hierarchy (higher roles inherit lower)
  roleHierarchy = {
    [ROLES.SUPER_ADMIN]: [ROLES.ORGANIZATION_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.TEACHER, ROLES.STUDENT],
    [ROLES.ORGANIZATION_ADMIN]: [ROLES.SCHOOL_ADMIN, ROLES.TEACHER, ROLES.STUDENT],
    [ROLES.SCHOOL_ADMIN]: [ROLES.DEPARTMENT_HEAD, ROLES.TEACHER, ROLES.STUDENT],
    // Add more
  };

  /**
   * @description Checks if user has access to resource/action.
   * @param {Object} user - User context from req.user.
   * @param {string} resource - Resource name.
   * @param {string} action - Action (create/read/update/delete).
   * @param {Object} [conditions={}] - Additional conditions.
   * @returns {Promise<boolean>} Access granted.
   * @throws {AuthorizationException} If access denied.
   */
  async hasAccess(user, resource, action, conditions = {}) {
    try {
      // Input validation
      if (!user || !resource || !action) {
        throw new Error('Invalid access check parameters');
      }

      // Get effective roles including hierarchy
      const effectiveRoles = new Set(user.roles);
      user.roles.forEach((role) => {
        if (this.roleHierarchy[role]) {
          this.roleHierarchy[role].forEach((inherited) => effectiveRoles.add(inherited));
        }
      });

      // Permission check logic (assume permissions are array of objects)
      const hasPermission = user.permissions.some((perm) => {
        if (perm.resource !== resource || !perm.actions.includes(action)) {return false;}

        // Check conditions
        for (const [key, value] of Object.entries(perm.conditions || {})) {
          if (conditions[key] !== value) {return false;}
        }
        return true;
      });

      if (!hasPermission) {
        throw new AuthorizationException('Insufficient permissions');
      }

      // Audit log access check
      logger.info(`Access granted: ${user.id} to ${resource}:${action}`);

      return true;
    } catch (err) {
      logger.warn(`Access denied: ${err.message}`);
      throw err;
    }
  }

  /**
   * @description Gets all permissions for user.
   * @param {string} userId - User ID.
   * @returns {Promise<Array>} Permissions.
   */
  async getUserPermissions(userId) {
    // Implement with cache for performance
    // Example: Use redis cache
  }
}

const permissionService = new PermissionService();

export { permissionService };