import { V1Adapter } from "#core/versioning/adapters/v1-adapter.js";
import { V2Adapter } from "#core/versioning/adapters/v2-adapter.js";
import { logger } from "#utils/core/logger.js";
import baseConfig from "#shared/config/environments/base.config.js";
import { BusinessException } from "#exceptions/business.exception.js";
import { AuditService } from "#core/audit/services/audit-log.service.js"; // Assume exists
import semver from "semver";

/**
 * @description Service for adapting responses based on client version
 */
class ResponseAdapterService {
  /**
   * @description Selects appropriate adapter for client version
   * @param {string} clientVersion - Client version
   * @param {Object} context - Request context
   * @returns {Object} Adapter instance
   */
  static getAdapter(clientVersion, context = {}) {
    const majorVersion = semver.major(clientVersion) || "1";
    switch (majorVersion.toString()) {
      case "1":
        return new V1Adapter(clientVersion, context);
      case "2":
        return new V2Adapter(clientVersion, context);
      default:
        logger.warn(
          `Unsupported version: ${clientVersion}, falling back to v1`,
        );
        AuditService.log("UNSUPPORTED_VERSION", {
          clientVersion,
          requestId: context.requestId,
        });
        return new V1Adapter(baseConfig.versioning.defaultVersion, context);
    }
  }

  /**
   * @description Transforms response data for client version
   * @param {any} data - Response data
   * @param {Object} context - Request context
   * @returns {Promise<any>} Transformed data
   */
  static async transformResponse(data, context) {
    try {
      if (!context.clientVersion) {
        logger.warn("No client version provided, returning raw data");
        return data;
      }

      const adapter = this.getAdapter(context.clientVersion, context);
      const startTime = process.hrtime.bigint();
      const transformed = await adapter.transform(data, context);
      const duration = Number(process.hrtime.bigint() - startTime) / 1e6;

      if (duration > baseConfig.versioning.slowTransformationThresholdMs) {
        logger.warn(`Slow transformation: ${duration}ms`, {
          clientVersion: context.clientVersion,
        });
        await AuditService.log("SLOW_TRANSFORMATION", {
          duration,
          clientVersion: context.clientVersion,
          requestId: context.requestId,
        });
      }

      return this.addVersionMetadata(transformed, context);
    } catch (error) {
      logger.error(`Response transformation error: ${error.message}`);
      await AuditService.log("RESPONSE_TRANSFORMATION_FAILED", {
        error: error.message,
        requestId: context.requestId,
      });
      throw new BusinessException("Response transformation failed");
    }
  }

  /**
   * @description Adds version metadata to response
   * @param {any} data - Response data
   * @param {Object} context - Request context
   * @returns {Object} Data with metadata
   * @private
   */
  static addVersionMetadata(data, context) {
    return {
      ...data,
      _meta: {
        ...data._meta,
        apiVersion: context.clientVersion,
        serverVersion: baseConfig.versioning.currentApiVersion,
        serverTime: new Date().toISOString(),
        requestId: context.requestId,
      },
    };
  }
}

export { ResponseAdapterService };
