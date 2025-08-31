// src/api/v1/school/auth/routes/auth.routes.js - FIXED VERSION
import { Router } from "express";
import rateLimit from "express-rate-limit";
import catchAsync from "#utils/core/catchAsync.js";
import { schemaValidation } from "#shared/middleware/validation/schema-validation.middleware.js";
import {
  loginSchema,
  registerSchema,
} from "#api/v1/school/auth/dto/login.dto.js";
import { authController } from "#api/v1/school/auth/controllers/auth.controller.js";
import { tenantMiddleware } from "#core/tenant/middleware/tenant.middleware.js";
import baseConfig from "#shared/config/environments/base.config.js";

/**
 * @description Authentication routes for school users
 * Handles login, registration, password reset, etc.
 */
const authRoutes = Router();

// FIXED: Create rate limiters with proper configuration access
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: baseConfig?.auth?.maxLoginAttempts || 5, // Default to 5 if config not available
  message: {
    error: "Too many login attempts",
    message: "Please try again after 15 minutes",
    code: "RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: "Too many login attempts",
      message: "Please try again after 15 minutes",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: baseConfig?.auth?.maxRegistrationAttempts || 3, // Default to 3 if config not available
  message: {
    error: "Too many registration attempts",
    message: "Please try again after 1 hour",
    code: "REGISTRATION_RATE_LIMIT_EXCEEDED",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: baseConfig?.auth?.maxPasswordResetAttempts || 3, // Default to 3 if config not available
  message: {
    error: "Too many password reset attempts",
    message: "Please try again after 1 hour",
    code: "PASSWORD_RESET_RATE_LIMIT_EXCEEDED",
  },
});

// Apply tenant middleware to all auth routes
authRoutes.use(tenantMiddleware);

/**
 * @route POST /api/v1/school/auth/login
 * @description User login
 * @access Public
 */
authRoutes.post(
  "/login",
  loginLimiter,
  schemaValidation(loginSchema),
  catchAsync(authController.login),
);

/**
 * @route POST /api/v1/school/auth/register
 * @description User registration
 * @access Public (with restrictions)
 */
authRoutes.post(
  "/register",
  registerLimiter,
  schemaValidation(registerSchema),
  catchAsync(authController.register),
);

/**
 * @route POST /api/v1/school/auth/refresh
 * @description Refresh JWT token
 * @access Private (with refresh token)
 */
authRoutes.post("/refresh", catchAsync(authController.refresh));

/**
 * @route POST /api/v1/school/auth/logout
 * @description User logout
 * @access Private
 */
authRoutes.post("/logout", catchAsync(authController.logout));

/**
 * @route POST /api/v1/school/auth/forgot-password
 * @description Forgot password request
 * @access Public
 */
authRoutes.post(
  "/forgot-password",
  passwordResetLimiter,
  catchAsync(authController.forgotPassword),
);

/**
 * @route POST /api/v1/school/auth/reset-password
 * @description Reset password with token
 * @access Public
 */
authRoutes.post(
  "/reset-password",
  passwordResetLimiter,
  catchAsync(authController.resetPassword),
);

/**
 * @route POST /api/v1/school/auth/change-password
 * @description Change password (authenticated user)
 * @access Private
 */
authRoutes.post("/change-password", catchAsync(authController.changePassword));

/**
 * @route GET /api/v1/school/auth/verify-email/:token
 * @description Verify email address
 * @access Public
 */
authRoutes.get("/verify-email/:token", catchAsync(authController.verifyEmail));

/**
 * @route POST /api/v1/school/auth/resend-verification
 * @description Resend email verification
 * @access Public
 */
authRoutes.post(
  "/resend-verification",
  rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: "Too many verification emails sent",
  }),
  catchAsync(authController.resendVerification),
);

/**
 * @route GET /api/v1/school/auth/me
 * @description Get current user profile
 * @access Private
 */
authRoutes.get("/me", catchAsync(authController.getCurrentUser));

/**
 * @route PUT /api/v1/school/auth/me
 * @description Update current user profile
 * @access Private
 */
authRoutes.put("/me", catchAsync(authController.updateProfile));

/**
 * @route POST /api/v1/school/auth/2fa/enable
 * @description Enable two-factor authentication
 * @access Private
 */
authRoutes.post("/2fa/enable", catchAsync(authController.enableTwoFactor));

/**
 * @route POST /api/v1/school/auth/2fa/verify
 * @description Verify two-factor authentication
 * @access Private
 */
authRoutes.post(
  "/2fa/verify",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Too many 2FA verification attempts",
  }),
  catchAsync(authController.verifyTwoFactor),
);

/**
 * @route POST /api/v1/school/auth/2fa/disable
 * @description Disable two-factor authentication
 * @access Private
 */
authRoutes.post("/2fa/disable", catchAsync(authController.disableTwoFactor));

/**
 * @route GET /api/v1/school/auth/sessions
 * @description Get active sessions
 * @access Private
 */
authRoutes.get("/sessions", catchAsync(authController.getSessions));

/**
 * @route DELETE /api/v1/school/auth/sessions/:sessionId
 * @description Terminate specific session
 * @access Private
 */
authRoutes.delete(
  "/sessions/:sessionId",
  catchAsync(authController.terminateSession),
);

/**
 * @route DELETE /api/v1/school/auth/sessions
 * @description Terminate all sessions (except current)
 * @access Private
 */
authRoutes.delete("/sessions", catchAsync(authController.terminateAllSessions));

export default authRoutes;
