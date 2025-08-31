import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import jwt from "jsonwebtoken";
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { TenantService } from "#core/tenant/services/tenant.service.js";
import UserModel from "#domain/models/school/user.model.js";
import { AuthenticationException } from "#shared/exceptions/authentication.exception.js";
import HTTP_STATUS from "#constants/http-status.js";

/**
 * @description Manages JWT authentication and token operations
 */
class JWTManager {
  static #isConfigured = false;
  static #config = null;

  /**
   * @description Configures the JWT strategy
   * @param {Object} config - JWT configuration object
   */
  static configure(config) {
    if (this.#isConfigured) {
      return;
    }

    this.#config = config;
    this.#setupStrategy();
    this.#isConfigured = true;

    logger.info("JWT Manager configured successfully");
  }

  /**
   * @description Sets up the Passport JWT strategy
   * @private
   */
  static #setupStrategy() {
    const options = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: this.#config.jwt.accessSecret,
      algorithms: ["HS256"],
      passReqToCallback: true,
    };

    const strategy = new JwtStrategy(options, async (req, payload, done) => {
      try {
        // Validate required payload fields
        if (!payload.sub || !payload.organizationId || !payload.schoolId) {
          throw new AuthenticationException(
            "Invalid token payload structure",
            HTTP_STATUS.UNAUTHORIZED,
          );
        }

        // Validate tenant
        const tenant = await TenantService.validateTenant(
          payload.organizationId,
          {
            requestId: req.requestId,
          },
        );

        // Find user with tenant isolation
        const user = await UserModel.findOne({
          _id: payload.sub,
          organizationId: payload.organizationId,
          schoolId: payload.schoolId,
          status: "active",
          isDeleted: false,
        })
          .select("+permissions +roles")
          .lean();

        if (!user) {
          await AuditService.log("JWT_USER_NOT_FOUND", {
            userId: payload.sub,
            organizationId: payload.organizationId,
            schoolId: payload.schoolId,
            requestId: req.requestId,
          });
          return done(
            new AuthenticationException(
              "User not found or inactive",
              HTTP_STATUS.UNAUTHORIZED,
            ),
            null,
          );
        }

        // Create user context
        const userContext = {
          id: user._id,
          email: user.email,
          roles: user.roles || [],
          permissions: user.permissions || [],
          organizationId: payload.organizationId,
          schoolId: payload.schoolId,
          tenant,
        };

        // Audit successful authentication
        await AuditService.log("JWT_AUTH_SUCCESS", {
          userId: user._id,
          organizationId: payload.organizationId,
          schoolId: payload.schoolId,
          requestId: req.requestId,
        });

        logger.debug(`JWT authentication successful for user: ${user._id}`, {
          requestId: req.requestId,
        });
        return done(null, userContext);
      } catch (error) {
        logger.error(`JWT authentication failed: ${error.message}`, {
          requestId: req.requestId,
        });
        await AuditService.log("JWT_AUTH_FAILED", {
          error: error.message,
          payload: { sub: payload.sub, organizationId: payload.organizationId },
          requestId: req.requestId,
        });
        return done(error, null);
      }
    });

    passport.use("jwt", strategy);
  }

  /**
   * @description Generates an access token
   * @param {Object} payload - Token payload
   * @param {string} [expiresIn] - Token expiration time
   * @returns {string} JWT access token
   * @throws {AuthenticationException} If token generation fails
   */
  static generateAccessToken(payload, expiresIn) {
    try {
      return jwt.sign(payload, this.#config.jwt.accessSecret, {
        expiresIn: expiresIn || this.#config.jwt.accessExpiresIn,
        algorithm: "HS256",
      });
    } catch (error) {
      logger.error(`Token generation failed: ${error.message}`);
      throw new AuthenticationException(
        "Token generation failed",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @description Generates a refresh token
   * @param {Object} payload - Token payload
   * @param {string} [expiresIn] - Token expiration time
   * @returns {string} JWT refresh token
   * @throws {AuthenticationException} If token generation fails
   */
  static generateRefreshToken(payload, expiresIn) {
    try {
      return jwt.sign(payload, this.#config.jwt.refreshSecret, {
        expiresIn: expiresIn || this.#config.jwt.refreshExpiresIn,
        algorithm: "HS256",
      });
    } catch (error) {
      logger.error(`Refresh token generation failed: ${error.message}`);
      throw new AuthenticationException(
        "Refresh token generation failed",
        HTTP_STATUS.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @description Verifies an access token
   * @param {string} token - JWT access token
   * @returns {Object} Decoded payload
   * @throws {AuthenticationException} If verification fails
   */
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.#config.jwt.accessSecret, {
        algorithms: ["HS256"],
      });
    } catch (error) {
      logger.warn(`Access token verification failed: ${error.message}`);
      throw new AuthenticationException(
        "Invalid or expired access token",
        HTTP_STATUS.UNAUTHORIZED,
      );
    }
  }

  /**
   * @description Verifies a refresh token
   * @param {string} token - JWT refresh token
   * @returns {Object} Decoded payload
   * @throws {AuthenticationException} If verification fails
   */
  static verifyRefreshToken(token) {
    try {
      return jwt.verify(token, this.#config.jwt.refreshSecret, {
        algorithms: ["HS256"],
      });
    } catch (error) {
      logger.warn(`Refresh token verification failed: ${error.message}`);
      throw new AuthenticationException(
        "Invalid or expired refresh token",
        HTTP_STATUS.UNAUTHORIZED,
      );
    }
  }

  /**
   * @description Gets the configured Passport instance
   * @returns {Object} Passport instance
   * @throws {Error} If not configured
   */
  static getPassportInstance() {
    if (!this.#isConfigured) {
      throw new Error("JWT Manager not configured. Call configure() first.");
    }
    return passport;
  }
}

export { JWTManager };
