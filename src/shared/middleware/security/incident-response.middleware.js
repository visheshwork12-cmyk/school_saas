// src/shared/middleware/security/incident-response.middleware.js
import { incidentResponseAutomation } from "#infrastructure/monitoring/incident-response-automation.js";
import { logger } from "#utils/core/logger.js";

/**
 * Middleware to trigger incident response based on security events
 */
export const incidentResponseMiddleware = (req, res, next) => {
  // Monitor response for potential security incidents
  const originalJson = res.json;
  
  res.json = function(body) {
    // Check for security incidents based on response
    setImmediate(async () => {
      try {
        const incident = detectIncidentFromResponse(req, res, body);
        if (incident) {
          await incidentResponseAutomation.processIncident(incident);
        }
      } catch (error) {
        logger.error('Incident response middleware error:', error);
      }
    });

    return originalJson.call(this, body);
  };

  next();
};

/**
 * Detect potential security incidents from request/response
 */
function detectIncidentFromResponse(req, res, body) {
  // Multiple failed authentication attempts
  if (req.path.includes('/auth/login') && res.statusCode === 401) {
    return {
      type: 'BRUTE_FORCE_ATTACK',
      incidentId: crypto.randomUUID(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date(),
      severity: 'HIGH',
      details: {
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode
      }
    };
  }

  // Suspicious data access patterns
  if (req.method === 'GET' && req.query.limit && parseInt(req.query.limit) > 1000) {
    return {
      type: 'SUSPICIOUS_USER_ACTIVITY',
      incidentId: crypto.randomUUID(),
      userId: req.user?.id,
      ipAddress: req.ip,
      timestamp: new Date(),
      severity: 'MEDIUM',
      details: {
        endpoint: req.path,
        queryLimit: req.query.limit,
        potentialDataExfiltration: true
      }
    };
  }

  // API rate limit exceeded
  if (res.statusCode === 429) {
    return {
      type: 'API_ABUSE',
      incidentId: crypto.randomUUID(),
      ipAddress: req.ip,
      timestamp: new Date(),
      severity: 'MEDIUM',
      details: {
        endpoint: req.path,
        rateLimitExceeded: true
      }
    };
  }

  return null;
}
