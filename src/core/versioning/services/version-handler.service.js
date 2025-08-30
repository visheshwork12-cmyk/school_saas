import semver from 'semver';
import { logger } from '#utils/core/logger.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';

/**
 * @description Service for version detection and compatibility management
 */
class VersionHandlerService {
  /**
   * @description Detects client version from request
   * @param {import('express').Request} req - Express request
   * @returns {string} Detected version
   */
  static detectClientVersion(req) {
    let version =
      req.headers['x-api-version']?.toString() ||
      req.query.version?.toString() ||
      req.params.version?.toString() ||
      this.extractFromUserAgent(req.headers['user-agent']) ||
      baseConfig.versioning.defaultVersion;

    // Validate semver format
    if (!semver.valid(version)) {
      logger.warn(`Invalid version format: ${version}, using default`, { requestId: req.requestId });
      version = baseConfig.versioning.defaultVersion;
      AuditService.log('INVALID_VERSION', { version, requestId: req.requestId });
    }

    logger.debug(`Client version detected: ${version}`, { requestId: req.requestId });
    return version;
  }

  /**
   * @description Extracts version from User-Agent
   * @param {string} [userAgent] - User-Agent header
   * @returns {string|null} Extracted version
   * @private
   */
  static extractFromUserAgent(userAgent) {
    if (!userAgent) {return null;}
    const match = userAgent.match(/SchoolERP\/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
  }

  /**
   * @description Gets version status and lifecycle
   * @param {string} version - Version string
   * @returns {{ status: string, sunsetDate: string | null }}
   */
  static getVersionStatus(version, req) {
    const lifecycle = {
      '1.0.0': { status: 'CURRENT', sunsetDate: null },
      '1.1.0': { status: 'CURRENT', sunsetDate: null },
      '2.0.0': { status: 'STABLE', sunsetDate: null },
      '2.1.0': { status: 'CURRENT', sunsetDate: null },
    };

    const status = lifecycle[version] || { status: 'UNKNOWN', sunsetDate: null };

    if (status.status === 'DEPRECATED') {
      AuditService.log('DEPRECATED_VERSION_ACCESSED', { version, requestId: req.requestId });
      logger.warn(`Deprecated version accessed: ${version}`, { requestId: req.requestId });
    }

    return status;
  }

  /**
   * @description Checks version compatibility
   * @param {string} clientVersion - Client version
   * @param {string} targetVersion - Target version
   * @returns {boolean} Compatibility status
   */
  static isCompatible(clientVersion, targetVersion, req) {
    if (!semver.valid(clientVersion) || !semver.valid(targetVersion)) {
      logger.warn(`Invalid version: client=${clientVersion}, target=${targetVersion}`, {
        requestId: req.requestId,
      });
      return false;
    }

    // Allow same major version (e.g., 1.x.x is compatible with 1.y.z)
    const isSameMajor = semver.major(clientVersion) === semver.major(targetVersion);
    return isSameMajor;
  }
}

export { VersionHandlerService };