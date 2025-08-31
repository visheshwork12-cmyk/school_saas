// src/domain/value-objects/email.vo.js

import { ValidationException } from "#exceptions/validation.exception.js";
import { emailValidator } from "#utils/validators/email.validator.js";

/**
 * @description Immutable Email value object with validation.
 *
 * @example
 * const email = new Email('test@example.com');
 * console.log(email.getDomain()); // 'example.com'
 */
class Email {
  /**
   * @param {string} value - Email address.
   */
  constructor(value) {
    this.validate(value);
    this.value = value.toLowerCase().trim();
    Object.freeze(this); // Immutability
  }

  /**
   * @description Validates email.
   * @param {string} email - Email to validate.
   * @throws {ValidationException} If invalid.
   */
  validate(email) {
    if (!emailValidator.isValid(email)) {
      throw new ValidationException("Invalid email format");
    }
  }

  /**
   * @description Gets domain part.
   * @returns {string} Domain.
   */
  getDomain() {
    return this.value.split("@")[1];
  }

  /**
   * @description Checks validity (redundant but for completeness).
   * @returns {boolean} Valid.
   */
  isValid() {
    return true; // Since validated in constructor
  }

  /**
   * @description Equals method for comparison.
   * @param {Email} other - Other email.
   * @returns {boolean} Equal.
   */
  equals(other) {
    return this.value === other.value;
  }
}

export { Email };
