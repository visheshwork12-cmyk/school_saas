import { logger } from '#utils/core/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '#exceptions/business.exception.js';
import { AuditService } from '#core/audit/services/audit-log.service.js'; // Assume exists

/**
 * @description Base class for response adapters
 */
class BaseAdapter {
  /**
   * @param {string} clientVersion - Client version
   * @param {Object} context - Request context
   */
  constructor(clientVersion, context = {}) {
    this.clientVersion = clientVersion;
    this.context = context;
  }

  /**
   * @description Transforms response data through pipeline
   * @param {any} data - Input data
   * @param {Object} context - Request context
   * @returns {Promise<any>} Transformed data
   */
  async transform(data, context) {
    try {
      let result = await this.preTransform(data, context);
      result = await this.transformCore(result, context);
      result = await this.postTransform(result, context);
      return result;
    } catch (error) {
      logger.error(`Base adapter transformation error: ${error.message}`);
      await AuditService.log('ADAPTER_TRANSFORMATION_FAILED', {
        error: error.message,
        clientVersion: this.clientVersion,
        requestId: context.requestId,
      });
      throw new BusinessException('Data transformation failed');
    }
  }

  /**
   * @description Pre-transformation hook
   * @param {any} data - Input data
   * @param {Object} context - Request context
   * @returns {Promise<any>} Processed data
   */
  async preTransform(data, context) {
    if (!data) {
      throw new BusinessException('Invalid data for transformation');
    }
    return data;
  }

  /**
   * @description Core transformation (must be implemented by subclasses)
   * @param {any} data - Input data
   * @param {Object} context - Request context
   * @returns {Promise<any>} Processed data
   */
  async transformCore(data, context) {
    throw new Error('transformCore must be implemented by subclass');
  }

  /**
   * @description Post-transformation hook
   * @param {any} data - Input data
   * @param {Object} context - Request context
   * @returns {Promise<any>} Processed data
   */
  async postTransform(data, context) {
    return this.addCommonMetadata(data, context);
  }

  /**
   * @description Adds common metadata to response
   * @param {any} data - Input data
   * @param {Object} context - Request context
   * @returns {Object} Data with metadata
   */
  addCommonMetadata(data, context) {
    return {
      ...data,
      _meta: {
        apiVersion: this.clientVersion,
        serverTime: new Date().toISOString(),
        requestId: context.requestId || uuidv4(),
        tenantId: context.tenantId,
      },
    };
  }
}

export { BaseAdapter };