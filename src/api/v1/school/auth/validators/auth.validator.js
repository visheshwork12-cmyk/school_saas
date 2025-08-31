// src/api/v1/school/auth/validators/auth.validator.js

import { ValidationException } from "#exceptions/validation.exception.js";
import { passwordValidator } from "#utils/validators/password.validator.js"; // Assume exists

/**
 * @description Validation rules for authentication.
 * Custom validators beyond Joi.
 *
 * @example
 * authValidator.validatePasswordStrength(password);
 */
const authValidator = {
  /**
   * @description Validates password strength.
   * @param {string} password - Password.
   * @throws {ValidationException} If weak.
   */
  validatePasswordStrength: (password) => {
    if (!passwordValidator.isStrong(password)) {
      throw new ValidationException("Password too weak");
    }
  },

  /**
   * @description Validates email format (redundant with Joi but for custom).
   * @param {string} email - Email.
   * @throws {ValidationException} If invalid.
   */
  // validateEmail: (email) => {
  //   // Use emailValidator from previous
  // },

  // Add more: validateRole, validateTenantAccess, etc.
};

export { authValidator };
