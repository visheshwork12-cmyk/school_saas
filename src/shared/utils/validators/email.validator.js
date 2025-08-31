// src/shared/utils/validators/email.validator.js

/**
 * @description Utility for email validation.
 * Uses regex for format check.
 *
 * @example
 * if (emailValidator.isValid('test@example.com')) { ... }
 */
const emailValidator = {
  /**
   * @description Checks if email is valid.
   * @param {string} email - Email to check.
   * @returns {boolean} Valid or not.
   */
  isValid: (email) => {
    // Sanitize input
    const sanitized = (email || "").trim().toLowerCase();
    const regex = /^[\w.-]+@([\w-]+\.)+[\w-]{2,4}$/;
    return regex.test(sanitized);
  },
};

export { emailValidator };

