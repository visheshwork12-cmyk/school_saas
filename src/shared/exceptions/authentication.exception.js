// src/shared/exceptions/authentication.exception.js

import { BaseException } from "#exceptions/base.exception.js";
import HTTP_STATUS from "#constants/http-status.js";

/**
 * @description Exception for authentication errors.
 *
 * @example
 * throw new AuthenticationException('Invalid credentials');
 */
class AuthenticationException extends BaseException {
  /**
   * @param {string} message - Error message.
   */
  constructor(message) {
    super(message, HTTP_STATUS.UNAUTHORIZED, "AUTHENTICATION_ERROR");
  }
}

export { AuthenticationException };
