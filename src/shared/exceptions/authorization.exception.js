import HTTP_STATUS from '#constants/http-status.js';
import { EventEmitter } from '#core/events/emitters/system-event.emitter.js';

/**
 * @description Custom exception for authorization errors
 */
class AuthorizationException extends Error {
  /**
   * @description Creates an authorization exception
   * @param {string} message - Error message
   * @param {Object} [details={}] - Additional error details
   * @param {Object} [context={}] - Request context (tenantId, userId, requestId)
   */
  constructor(message, details = {}, context = {}) {
    super(message);
    this.name = 'AuthorizationException';
    this.status = HTTP_STATUS.FORBIDDEN;
    this.code = details.code || 'AUTHORIZATION_FAILED';
    this.details = details;
    this.context = context;

    // Emit authorization error event
    const emitter = new EventEmitter(context);
    emitter.emit('AUTHORIZATION_ERROR', {
      message,
      code: this.code,
      details,
      tenantId: context.tenantId,
      userId: context.userId,
      requestId: context.requestId,
    });
  }
}

export { AuthorizationException };