// src/shared/exceptions/validation.exception.js

import { BaseException } from "#exceptions/base.exception.js";
import HTTP_STATUS from "#constants/http-status.js";

/**
 * @description Exception for validation errors.
 * Extends BaseException with details field.
 *
 * @example
 * throw new ValidationException('Invalid data', { field: 'email' });
 */
class ValidationException extends BaseException {
  /**
   * @param {string} message - Error message.
   * @param {Object} [details={}] - Validation details.
   */
  constructor(message, details = {}) {
    super(message, HTTP_STATUS.BAD_REQUEST, "VALIDATION_ERROR");
    this.details = details;
  }
}

export { ValidationException };
