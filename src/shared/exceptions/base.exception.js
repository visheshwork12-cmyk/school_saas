// src/shared/exceptions/base.exception.js

/**
 * @description Base exception class for all custom errors.
 * Includes status code, error code, and operational flag.
 * 
 * @example
 * throw new BaseException('Error occurred', 500, 'SERVER_ERROR');
 */
class BaseException extends Error {
  /**
   * @param {string} message - Error message.
   * @param {number} statusCode - HTTP status code.
   * @param {string} code - Error code.
   */
  constructor(message, statusCode, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true; // Mark as trusted error
    Error.captureStackTrace(this, this.constructor); // Exclude constructor from stack
  }
}

export { BaseException };