// Enhanced Role Guard with IAM Integration
import { catchAsync } from '#utils/core/catchAsync.js';
import { logger } from '#utils/core/logger.js';
import { AuthenticationException } from '#shared/exceptions/authentication.exception.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';

/**
 * Enhanced Role-Based Access Control Middleware
 * Integrates with AWS IAM for fine-grained permissions
 */
export const enhancedRoleGuard = (requiredRoles, requiredPermissions = []) => 
  catchAsync(async (req, res, next) => {
    try {
      // 1. Authentication Check
      if (!req.user?.id) {
        throw new AuthenticationException('User not authenticated', 'AUTH_REQUIRED');
      }

      // 2. Tenant Context Check
      if (!req.context?.tenantId) {
        throw new AuthenticationException('Tenant context missing', 'TENANT_REQUIRED');
      }

      // 3. Role Validation
      const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.role];
      const hasRequiredRole = Array.isArray(requiredRoles) 
        ? requiredRoles.some(role => userRoles.includes(role))
        : userRoles.includes(requiredRoles);

      if (!hasRequiredRole) {
        await AuditService.log('ROLE_ACCESS_DENIED', {
          userId: req.user.id,
          tenantId: req.context.tenantId,
          requiredRoles,
          userRoles,
          path: req.path,
          method: req.method
        });
        
        throw new AuthenticationException(
          `Access denied. Requires role: ${Array.isArray(requiredRoles) ? requiredRoles.join(' or ') : requiredRoles}`,
          'INSUFFICIENT_ROLE'
        );
      }

      // 4. Permission-Level Check
      if (requiredPermissions.length > 0) {
        const userPermissions = req.user.permissions || [];
        const hasPermission = requiredPermissions.every(permission => 
          userPermissions.includes(permission)
        );

        if (!hasPermission) {
          throw new AuthenticationException(
            'Insufficient permissions',
            'INSUFFICIENT_PERMISSIONS'
          );
        }
      }

      // 5. Success Audit
      await AuditService.log('ROLE_ACCESS_GRANTED', {
        userId: req.user.id,
        tenantId: req.context.tenantId,
        roles: userRoles,
        path: req.path,
        method: req.method
      });

      next();
    } catch (error) {
      logger.error('Role guard failed:', {
        error: error.message,
        userId: req.user?.id,
        tenantId: req.context?.tenantId,
        path: req.path
      });
      next(error);
    }
  });
