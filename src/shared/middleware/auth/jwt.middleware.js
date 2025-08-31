// src/shared/middleware/auth/jwt.middleware.js

import passport from "passport";
import catchAsync from "#utils/core/catchAsync.js";
import { AuthenticationException } from "#exceptions/authentication.exception.js";
import { logger } from "#utils/core/logger.js";

/**
 * @description Middleware for JWT token verification using Passport.
 * Injects user context on success.
 *
 * @param {import('express').Request} req - Request.
 * @param {import('express').Response} res - Response.
 * @param {import('express').NextFunction} next - Next.
 */
const jwtMiddleware = catchAsync(async (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err || !user) {
      logger.warn(`JWT auth failed: ${info ? info.message : "Unknown"}`);
      throw new AuthenticationException("Invalid or expired token");
    }
    req.user = user;
    next();
  })(req, res, next);
});

export { jwtMiddleware };
