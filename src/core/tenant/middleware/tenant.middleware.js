// src/core/tenant/middleware/tenant.middleware.js

import { TenantService } from '#core/tenant/services/tenant.service.js';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import HTTP_STATUS from '#constants/http-status.js';
import catchAsync from '#utils/core/catchAsync.js';

/**
 * Middleware to handle tenant context with support for public endpoints
 * 
 * @function tenantMiddleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 * @returns {Promise<void>}
 */
const tenantMiddleware = catchAsync(async (req, res, next) => {
  // 🔹 Extended public endpoints list - no tenant validation required
  const publicEndpoints = [
    '/health',
    '/status',
    '/api-docs',           // Swagger UI
    '/api-docs.json',      // OpenAPI JSON spec
    '/docs',               // ReDoc documentation
    '/favicon.ico',        // Favicon requests
    '/robots.txt',         // SEO robots file
  ];

  // 🔹 Check for exact path matches and path patterns
  const isPublicEndpoint = publicEndpoints.some(endpoint => {
    // Exact match
    if (req.path === endpoint) { return true; }

    // Pattern match for swagger assets
    if (req.path.startsWith('/api-docs/') && endpoint === '/api-docs') { return true; }

    return false;
  });

  if (isPublicEndpoint) {
    req.context = req.context || {};
    req.context.tenantId = baseConfig.multiTenant.defaultTenantId;
    req.context.isPublic = true;

    logger.debug(`Public endpoint accessed: ${req.path}`, {
      requestId: req.requestId,
      userAgent: req.get('User-Agent')
    });

    await AuditService.log('PUBLIC_ENDPOINT_ACCESSED', {
      action: 'access_public_endpoint',
      path: req.path,
      method: req.method,
      requestId: req.requestId,
      userAgent: req.get('User-Agent')
    });

    return next();
  }

  // 🔹 Extract tenant ID from multiple sources (priority order)
  const tenantId =
    req.headers[baseConfig.multiTenant.tenantHeaderName]?.toString() ||
    req.headers['x-school-id']?.toString() ||                          // Alternative header
    req.query.tenantId?.toString() ||                                  // Query parameter
    req.body?.tenantId?.toString();                                    // Request body

  if (!tenantId) {
    logger.error('Tenant ID required', {
      path: req.path,
      method: req.method,
      ip: req.ip,
      headers: Object.keys(req.headers),
      availableHeaders: {
        'x-tenant-id': req.headers['x-tenant-id'],
        'x-school-id': req.headers['x-school-id']
      }
    });

    await AuditService.log('TENANT_ID_MISSING', {
      action: 'tenant_validation_failed',
      path: req.path,
      method: req.method,
      ip: req.ip,
      requestId: req.requestId
    });

    // 🔹 Return detailed error for development
    const errorMessage = baseConfig.env === 'development'
      ? `Tenant ID required. Please provide via header '${baseConfig.multiTenant.tenantHeaderName}' or 'x-school-id'`
      : 'Tenant ID required';

    throw new BusinessException(errorMessage, HTTP_STATUS.BAD_REQUEST);
  }

  try {
    // Validate tenant
    const tenant = await TenantService.validateTenant(tenantId, { requestId: req.requestId });

    req.context = req.context || {};
    req.context.tenantId = tenant.tenantId;
    req.context.tenant = tenant;
    req.context.isPublic = false;
    req.tenant = tenant; // For backward compatibility

    logger.debug(`Tenant context set: ${tenantId}`, {
      requestId: req.requestId,
      tenantName: tenant.name
    });

    await AuditService.log('TENANT_VALIDATED', {
      action: 'tenant_validation_success',
      tenantId: tenant.tenantId,
      path: req.path,
      requestId: req.requestId
    });

    next();
  } catch (error) {
    logger.error(`Tenant validation failed: ${error.message}`, {
      tenantId,
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    await AuditService.log('TENANT_VALIDATION_FAILED', {
      action: 'tenant_validation_error',
      tenantId,
      path: req.path,
      method: req.method,
      error: error.message,
      requestId: req.requestId
    });

    throw error;
  }
});

export { tenantMiddleware };
