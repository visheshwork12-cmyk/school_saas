// src/shared/middleware/security/event-correlation.middleware.js
import { securityEventCorrelator } from "#infrastructure/monitoring/security-event-correlator.js";
import { logger } from "#utils/core/logger.js";

/**
 * Middleware to capture and correlate security events
 */
export const eventCorrelationMiddleware = (req, res, next) => {
  // Capture request start time
  req.startTime = Date.now();

  // Override res.json to capture response
  const originalJson = res.json;
  res.json = function(body) {
    // Create security event
    const securityEvent = {
      eventType: determineEventType(req, res, body),
      tenantId: req.context?.tenantId,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      responseTime: Date.now() - req.startTime,
      timestamp: new Date(),
      geoLocation: req.geoLocation,
      requestId: req.requestId,
      metadata: extractSecurityMetadata(req, res, body)
    };

    // Process security event for correlation (async, non-blocking)
    setImmediate(async () => {
      try {
        await securityEventCorrelator.processSecurityEvent(securityEvent);
      } catch (error) {
        logger.error('Event correlation processing failed:', error);
      }
    });

    return originalJson.call(this, body);
  };

  next();
};

/**
 * Determine event type based on request/response
 */
function determineEventType(req, res, body) {
  // Authentication events
  if (req.path.includes('/auth/login')) {
    return res.statusCode === 200 ? 'LOGIN_SUCCESS' : 'LOGIN_FAILED';
  }
  
  if (req.path.includes('/auth/logout')) {
    return 'LOGOUT';
  }

  if (req.path.includes('/auth/register')) {
    return res.statusCode === 201 ? 'REGISTRATION_SUCCESS' : 'REGISTRATION_FAILED';
  }

  // Permission events
  if (res.statusCode === 403) {
    return 'UNAUTHORIZED_ACCESS';
  }

  if (res.statusCode === 401) {
    return 'AUTHENTICATION_FAILED';
  }

  // Data access events
  if (req.method === 'GET' && req.query.limit && parseInt(req.query.limit) > 100) {
    return 'BULK_DOWNLOAD';
  }

  if (req.method === 'POST' || req.method === 'PUT') {
    return 'DATA_MODIFICATION';
  }

  // Admin events
  if (req.path.includes('/admin/') || req.path.includes('/superadmin/')) {
    return 'ADMIN_ACCESS';
  }

  // Role/permission changes
  if (req.path.includes('/roles') || req.path.includes('/permissions')) {
    return req.method === 'POST' ? 'ROLE_CHANGED' : 'PERMISSION_GRANTED';
  }

  // API rate limiting
  if (res.statusCode === 429) {
    return 'API_RATE_EXCEEDED';
  }

  // Default event
  return 'API_REQUEST';
}

/**
 * Extract security-relevant metadata
 */
function extractSecurityMetadata(req, res, body) {
  const metadata = {};

  // Request size
  const contentLength = req.get('content-length');
  if (contentLength) {
    metadata.requestSize = parseInt(contentLength);
  }

  // Response size
  if (body && typeof body === 'object') {
    metadata.responseSize = JSON.stringify(body).length;
    
    // Record count for bulk operations
    if (body.data && Array.isArray(body.data)) {
      metadata.recordCount = body.data.length;
    }
  }

  // Query complexity (for database queries)
  if (req.query) {
    metadata.queryParams = Object.keys(req.query).length;
    
    // Check for complex queries
    const complexParams = ['$where', '$regex', '$or', '$and'];
    const hasComplexQuery = Object.keys(req.query).some(key => 
      complexParams.some(param => key.includes(param))
    );
    
    if (hasComplexQuery) {
      metadata.complexQuery = true;
    }
  }

  // File upload detection
  if (req.files || (req.body && req.body.files)) {
    metadata.fileUpload = true;
    metadata.fileCount = req.files ? req.files.length : 0;
  }

  // Tenant switching
  if (req.headers['x-tenant-switch']) {
    metadata.tenantSwitch = true;
    metadata.previousTenant = req.headers['x-previous-tenant'];
  }

  return metadata;
}
