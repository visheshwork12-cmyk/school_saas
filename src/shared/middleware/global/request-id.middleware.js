import { v4 as uuidv4 } from 'uuid';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js'; // Assume exists

/**
 * @description Middleware to add unique request ID for tracing
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Next function
 */
const requestId = async (req, res, next) => {
  try {
    const requestId = uuidv4();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Log request start for audit
    await AuditService.log('REQUEST_START', {
      requestId,
      method: req.method,
      path: req.path,
      tenantId: req.tenant?.tenantId,
    });

    logger.debug(`Request ID assigned: ${requestId}`);
    next();
  } catch (err) {
    logger.error(`Request ID middleware error: ${err.message}`);
    next(err);
  }
};

export { requestId };