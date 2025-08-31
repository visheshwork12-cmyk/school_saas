// src/api/v1/school/auth/services/auth.service.js

import bcrypt from "bcryptjs";
import { jwtService } from "#core/auth/services/jwt.service.js";
import { UserRepository } from "#core/repositories/school/user.repository.js";
import { AuthenticationException } from "#exceptions/authentication.exception.js";
import { logger } from "#utils/core/logger.js";
import config from "#config/index.js";

/**
 * @description Service for authentication business logic.
 * Handles login, register, etc., with security features.
 *
 * @example
 * const tokens = await authService.login(credentials);
 */
class AuthService {
  constructor() {
    this.userRepo = new UserRepository();
  }

  /**
   * @description Authenticates user and generates tokens.
   * @param {Object} credentials - Email, password, schoolId.
   * @param {Object} tenant - Tenant context.
   * @returns {Promise<{accessToken: string, refreshToken: string}>} Tokens.
   */
  async login(credentials, tenant) {
    try {
      const { email, password, schoolId } = credentials;

      // Find user with tenant isolation
      const user = await this.userRepo.findByEmailAndSchool(
        email,
        schoolId,
        true,
      );

      if (!user) {
        throw new AuthenticationException("Invalid credentials");
      }

      // Check failed attempts for lockout
      if (user.failedAttempts >= config.auth.maxLoginAttempts) {
        throw new AuthenticationException("Account locked");
      }

      // Password validation
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        await this.userRepo.incrementFailedAttempts(user._id);
        throw new AuthenticationException("Invalid credentials");
      }

      // Reset attempts
      await this.userRepo.resetFailedAttempts(user._id);

      // Generate tokens
      const payload = {
        sub: user._id,
        organizationId: tenant.organizationId,
        schoolId,
        roles: user.roles,
        permissions: user.permissions,
      };

      const accessToken = jwtService.sign(payload, config.jwt.accessExpiresIn);
      const refreshToken = jwtService.sign(
        payload,
        config.jwt.refreshExpiresIn,
        config.jwt.refreshSecret,
      );

      // Audit log
      logger.info(`Login successful for user: ${user._id}`);

      return { accessToken, refreshToken };
    } catch (err) {
      logger.error(`Login error: ${err.message}`);
      throw err;
    }
  }

  // Implement register, refreshToken, logout, etc., similarly with security checks
}

const authService = new AuthService();

export { authService };
