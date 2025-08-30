import semver from 'semver';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import HTTP_STATUS from '#constants/http-status.js';
import catchAsync from '#utils/core/catchAsync.js';

/**
 * @description Middleware for transforming response based on client version
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
const responseVersionMiddleware = catchAsync(async (req, res, next) => {
  // Skip transformation for public endpoints
  const publicEndpoints = ['/health', '/status'];
  if (publicEndpoints.includes(req.path)) {
    logger.debug(`Skipping response transformation for public endpoint: ${req.path}`, {
      requestId: req.requestId,
    });
    await AuditService.log('RESPONSE_TRANSFORMATION_SKIPPED', {
      action: 'response_transformation',
      path: req.path,
      requestId: req.requestId,
    });
    return next();
  }

  // Get client version from context
  const clientVersion = req.context?.clientVersion;
  if (!clientVersion || !semver.valid(clientVersion)) {
    logger.error(`Invalid client version for response transformation: ${clientVersion}`, {
      path: req.path,
      requestId: req.requestId,
    });
    await AuditService.log('INVALID_RESPONSE_VERSION', {
      action: 'response_transformation',
      clientVersion,
      path: req.path,
      requestId: req.requestId,
    });
    throw new BusinessException('Invalid client version for response transformation', HTTP_STATUS.BAD_REQUEST);
  }

  // Original send method
  const originalSend = res.send.bind(res);

  // Override send method to transform response
  res.send = async (body) => {
    try {
      let transformedBody = body;

      // Example transformation: Adjust response format for older versions
      if (semver.lt(clientVersion, baseConfig.versioning.currentApiVersion)) {
        transformedBody = transformResponse(body, clientVersion);
      }

      logger.debug(`Response transformed for version: ${clientVersion}`, {
        path: req.path,
        requestId: req.requestId,
      });
      await AuditService.log('RESPONSE_TRANSFORMED', {
        action: 'response_transformation',
        clientVersion,
        path: req.path,
        requestId: req.requestId,
      });

      return originalSend(transformedBody);
    } catch (error) {
      logger.error(`Response transformation error: ${error.message}`, {
        path: req.path,
        requestId: req.requestId,
      });
      await AuditService.log('RESPONSE_TRANSFORMATION_FAILED', {
        action: 'response_transformation',
        clientVersion,
        path: req.path,
        error: error.message,
        requestId: req.requestId,
      });
      throw new BusinessException('Response transformation failed', HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  };

  next();
});

/**
 * @description Transforms response body based on client version
 * @param {any} body - Original response body
 * @param {string} clientVersion - Client version
 * @returns {any} Transformed response body
 */
function transformResponse(body, clientVersion) {
  // Example transformation: Wrap response in a legacy format for older versions
  if (semver.lt(clientVersion, '1.1.0')) {
    return {
      data: body,
      version: clientVersion,
      transformed: true,
    };
  }
  return body;
}

export { responseVersionMiddleware };