import catchAsync from "#utils/core/catchAsync.js";
import { AuthorizationException } from "#exceptions/authorization.exception.js";
import { logger } from "#utils/core/logger.js";

/**
 * Permission Check Middleware Factory
 * Creates middleware that checks for a specific permission
 */
const requirePermission = (requiredPermission) => {
    return catchAsync(async (req, res, next) => {
        if (!req.user) {
            throw new AuthorizationException('Authentication required', 'AUTHENTICATION_REQUIRED');
        }

        const { userId, id, permissions = [], role } = req.user;
        const actualUserId = userId || id;

        // Super admin has all permissions
        if (role === 'SUPER_ADMIN' || role === 'PLATFORM_ADMIN') {
            logger.debug('Permission granted - Super admin access', {
                userId: actualUserId,
                requiredPermission,
                role
            });
            return next();
        }

        // Check if user has the required permission
        const hasPermission = permissions.includes(requiredPermission) ||
            permissions.includes('*') ||
            permissions.some(p => p.startsWith(requiredPermission.split('.')[0] + '.*'));

        if (!hasPermission) {
            logger.warn('Permission denied', {
                userId: actualUserId,
                requiredPermission,
                userPermissions: permissions,
                role,
                path: req.path,
                method: req.method
            });
            throw new AuthorizationException(
                `Access denied. Required permission: ${requiredPermission}`,
                'INSUFFICIENT_PERMISSIONS'
            );
        }

        logger.debug('Permission granted', {
            userId: actualUserId,
            requiredPermission,
            role
        });

        next();
    });
};

/**
 * Multiple Permissions Check Middleware Factory
 * User must have ALL specified permissions
 */
const requireAllPermissions = (requiredPermissions) => {
    return catchAsync(async (req, res, next) => {
        if (!req.user) {
            throw new AuthorizationException('Authentication required', 'AUTHENTICATION_REQUIRED');
        }

        const { userId, id, permissions = [], role } = req.user;
        const actualUserId = userId || id;

        // Super admin has all permissions
        if (role === 'SUPER_ADMIN' || role === 'PLATFORM_ADMIN') {
            logger.debug('Permission granted - Super admin access', {
                userId: actualUserId,
                requiredPermissions,
                role
            });
            return next();
        }

        // Check if user has ALL required permissions
        const missingPermissions = requiredPermissions.filter(permission =>
            !permissions.includes(permission) &&
            !permissions.includes('*') &&
            !permissions.some(p => p.startsWith(permission.split('.')[0] + '.*'))
        );

        if (missingPermissions.length > 0) {
            logger.warn('Multiple permissions denied', {
                userId: actualUserId,
                requiredPermissions,
                missingPermissions,
                userPermissions: permissions,
                role,
                path: req.path,
                method: req.method
            });
            throw new AuthorizationException(
                `Access denied. Missing permissions: ${missingPermissions.join(', ')}`,
                'INSUFFICIENT_PERMISSIONS'
            );
        }

        logger.debug('All permissions granted', {
            userId: actualUserId,
            requiredPermissions,
            role
        });

        next();
    });
};

/**
 * Any Permission Check Middleware Factory
 * User must have ANY of the specified permissions
 */
const requireAnyPermission = (requiredPermissions) => {
    return catchAsync(async (req, res, next) => {
        if (!req.user) {
            throw new AuthorizationException('Authentication required', 'AUTHENTICATION_REQUIRED');
        }

        const { userId, id, permissions = [], role } = req.user;
        const actualUserId = userId || id;

        // Super admin has all permissions
        if (role === 'SUPER_ADMIN' || role === 'PLATFORM_ADMIN') {
            logger.debug('Permission granted - Super admin access', {
                userId: actualUserId,
                requiredPermissions,
                role
            });
            return next();
        }

        // Check if user has ANY of the required permissions
        const hasAnyPermission = requiredPermissions.some(permission =>
            permissions.includes(permission) ||
            permissions.includes('*') ||
            permissions.some(p => p.startsWith(permission.split('.')[0] + '.*'))
        );

        if (!hasAnyPermission) {
            logger.warn('No matching permissions found', {
                userId: actualUserId,
                requiredPermissions,
                userPermissions: permissions,
                role,
                path: req.path,
                method: req.method
            });
            throw new AuthorizationException(
                `Access denied. Required any of: ${requiredPermissions.join(', ')}`,
                'INSUFFICIENT_PERMISSIONS'
            );
        }

        logger.debug('At least one permission granted', {
            userId: actualUserId,
            requiredPermissions,
            role
        });

        next();
    });
};

/**
 * Role-based Access Control Middleware
 */
const requireRole = (requiredRole) => {
    return catchAsync(async (req, res, next) => {
        if (!req.user) {
            throw new AuthorizationException('Authentication required', 'AUTHENTICATION_REQUIRED');
        }

        const { userId, id, role } = req.user;
        const actualUserId = userId || id;

        if (role !== requiredRole && role !== 'SUPER_ADMIN') {
            logger.warn('Role access denied', {
                userId: actualUserId,
                userRole: role,
                requiredRole,
                path: req.path,
                method: req.method
            });
            throw new AuthorizationException(
                `Access denied. Required role: ${requiredRole}`,
                'INSUFFICIENT_ROLE'
            );
        }

        logger.debug('Role access granted', {
            userId: actualUserId,
            requiredRole,
            role
        });

        next();
    });
};

export {
    requirePermission,
    requireAllPermissions,
    requireAnyPermission,
    requireRole
};

// Keep backward compatibility
export default requirePermission;