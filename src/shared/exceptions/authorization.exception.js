// src/shared/exceptions/authorization.exception.js
import HTTP_STATUS from "#constants/http-status.js";
import { logger } from "#utils/core/logger.js";

/**
 * @description Custom exception for authorization errors
 * @extends Error
 */
class AuthorizationException extends Error {
  /**
   * @description Creates an authorization exception
   * @param {string} message - Error message
   * @param {string} [code='AUTHORIZATION_FAILED'] - Error code
   * @param {number} [statusCode=403] - HTTP status code
   * @param {Object} [details={}] - Additional error details
   * @param {Object} [context={}] - Request context (tenantId, userId, requestId)
   */
  constructor(
    message = 'Access denied', 
    code = 'AUTHORIZATION_FAILED', 
    statusCode = HTTP_STATUS.FORBIDDEN,
    details = {}, 
    context = {}
  ) {
    super(message);
    
    this.name = "AuthorizationException";
    this.status = statusCode;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.context = context;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AuthorizationException);
    }

    // ✅ FIX: Use async event emission to avoid constructor issues
    this.emitAuthError();
  }

  /**
   * @description Emit authorization error event asynchronously
   */
  async emitAuthError() {
    try {
      // Use dynamic import to avoid circular dependency
      const { systemEventEmitter } = await import("#core/events/emitters/system-event.emitter.js");
      
      // Emit event asynchronously
      setImmediate(() => {
        systemEventEmitter.safeEmit("AUTHORIZATION_ERROR", {
          message: this.message,
          code: this.code,
          details: this.details,
          tenantId: this.context.tenantId,
          userId: this.context.userId,
          requestId: this.context.requestId,
          timestamp: this.timestamp
        });
      });
    } catch (error) {
      // If event emission fails, just log - don't break the exception
      logger.warn('Failed to emit authorization error event:', {
        error: error.message,
        originalError: this.message
      });
    }
  }

  /**
   * @description Convert exception to JSON
   * @returns {Object} JSON representation
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      status: this.status,
      statusCode: this.statusCode,
      details: this.details,
      context: this.context,
      timestamp: this.timestamp
    };
  }

  /**
   * @description Convert to API response format
   * @returns {Object} API response object
   */
  toResponse() {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        type: 'AUTHORIZATION_ERROR',
        details: this.details
      },
      timestamp: this.timestamp,
      requestId: this.context.requestId
    };
  }
}

export { AuthorizationException };
export default AuthorizationException;
