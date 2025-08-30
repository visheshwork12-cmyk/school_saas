import { BaseException } from '#exceptions/base.exception.js';
import HTTP_STATUS  from '#constants/http-status.js';
import { logger } from '#utils/core/logger.js';
// import { AuditService } from '#core/audit/services/audit-log.service.js';

/**
 * @description Exception for business logic errors
 * @extends BaseException
 */
class BusinessException extends BaseException {
  /**
   * @param {string} message - Error message
   * @param {number} [statusCode=400] - HTTP status code
   * @param {Object} [context={}] - Additional context
   */
  constructor(message, statusCode = HTTP_STATUS.BAD_REQUEST, context = {}) {
    super(message, statusCode, 'BUSINESS_ERROR');
    this.context = context;

    logger.error(`Business error: ${message}`, context);
    // AuditService.log('BUSINESS_ERROR', { message, statusCode, context });
  }
}

export { BusinessException };