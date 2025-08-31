// src/core/auth/strategies/jwt.strategy.js

import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import passport from "passport";
import config from "#config/index.js";
import { AuthenticationException } from "#exceptions/authentication.exception.js";
import UserModel from "#domain/models/school/user.model.js";
import { logger } from "#utils/core/logger.js";

/**
 * @description Configures Passport JWT strategy for authentication.
 * Validates JWT, loads user with multi-tenant context, injects roles/permissions.
 *
 * @param {Object} opts - Strategy options.
 * @returns {JwtStrategy} Configured strategy.
 *
 * @example
 * passport.use(jwtStrategy);
 */
const jwtStrategy = new JwtStrategy(
  {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.jwt.accessSecret,
    algorithms: ["RS256"], // Secure algorithm
    passReqToCallback: true,
  },
  async (req, payload, done) => {
    try {
      // Multi-tenant validation from payload
      const { organizationId, schoolId } = payload;
      if (!organizationId || !schoolId) {
        throw new AuthenticationException("Invalid tenant context in token");
      }

      // Load user with tenant isolation
      const user = await UserModel.findOne({
        _id: payload.sub,
        organizationId,
        schoolId,
        status: "active",
        isDeleted: false,
      }).select("+permissions +roles");

      if (!user) {
        throw new AuthenticationException("User not found or inactive");
      }

      // Inject full context
      req.user = {
        id: user._id,
        roles: user.roles,
        permissions: user.permissions,
        organizationId,
        schoolId,
        // Add subscription details if needed
      };

      // Audit log successful auth
      logger.info(
        `JWT validated for user: ${user._id} | Tenant: ${organizationId}/${schoolId}`,
      );

      done(null, req.user);
    } catch (err) {
      logger.error(`JWT validation error: ${err.message}`);
      done(err, false);
    }
  },
);

// Initialize passport with strategy
passport.use("jwt", jwtStrategy);

export { jwtStrategy };
