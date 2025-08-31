import { logger } from "#utils/core/logger.js";
import baseConfig from "#shared/config/environments/base.config.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { BusinessException } from "#shared/exceptions/business.exception.js";
import HTTP_STATUS from "#constants/http-status.js";
import catchAsync from "#utils/core/catchAsync.js";
import { VersionHandlerService } from "#core/versioning/services/version-handler.service.js";

/**
 * @description Middleware for version detection and adaptation
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @param {import('express').NextFunction} next - Express next function
 * @returns {Promise<void>}
 */
const versionAdapterMiddleware = catchAsync(async (req, res, next) => {
  // Skip version validation for public endpoints
  const publicEndpoints = ["/health", "/status"];
  if (publicEndpoints.includes(req.path)) {
    req.context = req.context || {};
    req.context.clientVersion = baseConfig.versioning.currentApiVersion;
    req.context.versionStatus = { status: "CURRENT", sunsetDate: null };
    logger.debug(
      `Public endpoint accessed, using default version: ${req.path}`,
      {
        requestId: req.requestId,
      },
    );
    await AuditService.log("PUBLIC_ENDPOINT_VERSION", {
      action: "version_check",
      path: req.path,
      version: req.context.clientVersion,
      requestId: req.requestId,
    });
    res.setHeader("X-API-Version", req.context.clientVersion);
    return next();
  }

  // Detect client version
  const clientVersion = VersionHandlerService.detectClientVersion(req);

  // Validate compatibility
  if (
    !VersionHandlerService.isCompatible(
      clientVersion,
      baseConfig.versioning.currentApiVersion,
    )
  ) {
    logger.error(`Incompatible version: ${clientVersion}`, {
      path: req.path,
      method: req.method,
      requestId: req.requestId,
    });
    await AuditService.log("VERSION_INCOMPATIBLE", {
      action: "version_check",
      requestedVersion: clientVersion,
      currentVersion: baseConfig.versioning.currentApiVersion,
      path: req.path,
      requestId: req.requestId,
    });
    throw new BusinessException(
      `Incompatible version: ${clientVersion}`,
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  // Get version status
  const versionStatus = VersionHandlerService.getVersionStatus(clientVersion);

  // Set context
  req.context = {
    ...req.context,
    clientVersion,
    versionStatus,
  };

  // Set version headers
  res.setHeader("X-API-Version", clientVersion);
  if (
    versionStatus.status === "DEPRECATED" ||
    versionStatus.status === "MAINTENANCE"
  ) {
    res.setHeader(
      "X-Version-Warning",
      `${versionStatus.status} version, sunset: ${versionStatus.sunsetDate || "TBD"}`,
    );
  }

  await AuditService.log("VERSION_CHECK", {
    action: "version_check",
    clientVersion,
    status: versionStatus.status,
    requestId: req.requestId,
  });

  logger.debug(`Version middleware applied: ${clientVersion}`, {
    requestId: req.requestId,
  });
  next();
});

export { versionAdapterMiddleware };
