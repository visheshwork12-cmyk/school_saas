// src/domain/entities/platform/organization.entity.js

import { ValidationException } from "#exceptions/validation.exception.js";

/**
 * @description Organization entity with business logic.
 * Validates and manages organization data.
 *
 * @example
 * const org = new OrganizationEntity({ name: 'Org1' });
 * org.validate();
 */
class OrganizationEntity {
  /**
   * @param {Object} data - Organization data.
   */
  constructor(data) {
    this.name = data.name;
    this.subscriptionStatus = data.subscriptionStatus;
    // Add more fields
  }

  /**
   * @description Validates the entity.
   * @throws {ValidationException} If invalid.
   */
  validate() {
    if (!this.name || this.name.trim().length < 3) {
      throw new ValidationException(
        "Organization name must be at least 3 characters",
      );
    }
    // Add more validations
  }

  /**
   * @description Checks if subscription is active.
   * @returns {boolean} Active status.
   */
  isActive() {
    return this.subscriptionStatus === "active"; // Use enum
  }
}

export { OrganizationEntity };
