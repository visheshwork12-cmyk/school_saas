// src/core/repositories/school/user.repository.js

import { BaseRepository } from '#core/repositories/base/base.repository.js';
import UserModel from '#domain/models/school/user.model.js';
import { logger } from '#utils/core/logger.js';

/**
 * @description Repository for user data access with tenant isolation.
 * Extends BaseRepository.
 * 
 * @example
 * const user = await userRepo.findByEmail(email);
 */
class UserRepository extends BaseRepository {
  constructor() {
    super(UserModel);
  }

  /**
   * @description Finds user by email with optional password.
   * @param {string} email - Email.
   * @param {boolean} includePassword - Include password field.
   * @returns {Promise<Object|null>} User.
   */
  async findByEmail(email, includePassword = false) {
    const select = includePassword ? '+password' : '';
    return this.model.findOne({ email, isDeleted: false }).select(select);
  }

  /**
   * @description Finds user by email and school.
   * @param {string} email - Email.
   * @param {string} schoolId - School ID.
   * @param {boolean} includePassword - Include password.
   * @returns {Promise<Object|null>} User.
   */
  async findByEmailAndSchool(email, schoolId, includePassword = false) {
    const select = includePassword ? '+password' : '';
    return this.model.findOne({ email, schoolId, isDeleted: false }).select(select);
  }

  // Implement other methods: incrementFailedAttempts, resetFailedAttempts, etc.
}

const userRepository = new UserRepository();

export { UserRepository, userRepository };