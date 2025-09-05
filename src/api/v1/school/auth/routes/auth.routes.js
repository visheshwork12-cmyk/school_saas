// src/api/v1/school/auth/routes/auth.routes.js - COMPLETE FIXED VERSION
import { Router } from "express";
import rateLimit from "express-rate-limit";
import catchAsync from "#utils/core/catchAsync.js";
import { schemaValidation } from "#shared/middleware/validation/schema-validation.middleware.js";
import { loginSchema, registerSchema } from "#api/v1/school/auth/dto/login.dto.js";
import { authController } from "#api/v1/school/auth/controllers/auth.controller.js";
import { tenantMiddleware } from "#core/tenant/middleware/tenant.middleware.js";
import baseConfig from "#shared/config/environments/base.config.js";

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *     tenantHeader:
 *       type: apiKey
 *       in: header
 *       name: X-Tenant-ID
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: user@school.com
 *         password:
 *           type: string
 *           format: password
 *           example: password123
 *         rememberMe:
 *           type: boolean
 *           default: false
 *     LoginResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *           example: Login successful
 *         data:
 *           type: object
 *           properties:
 *             user:
 *               $ref: '#/components/schemas/User'
 *             tokens:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                 refreshToken:
 *                   type: string
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         firstName:
 *           type: string
 *         lastName:
 *           type: string
 *         email:
 *           type: string
 *         role:
 *           type: string
 */

const authRoutes = Router();

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: baseConfig?.auth?.maxLoginAttempts || 5,
  message: {
    error: "Too many login attempts",
    message: "Please try again after 15 minutes",
    code: "RATE_LIMIT_EXCEEDED",
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


// Apply tenant middleware
authRoutes.use(tenantMiddleware);

/**
 * @swagger
 * /api/v1/school/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate user with email and password
 *     tags: [Authentication]
 *     security:
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
authRoutes.post(
  "/login",
  loginLimiter,
  schemaValidation(loginSchema),
  catchAsync(authController.login),
);

/**
 * @swagger
 * /api/v1/school/auth/register:
 *   post:
 *     summary: User registration
 *     description: Register new user account
 *     tags: [Authentication]
 *     security:
 *       - tenantHeader: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *               - role
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               role:
 *                 type: string
 *                 enum: [TEACHER, STUDENT, ADMIN, PARENT]
 *     responses:
 *       201:
 *         description: Registration successful
 *       400:
 *         description: Invalid registration data
 */
authRoutes.post(
  "/register",
  registerLimiter,
  schemaValidation(registerSchema),
  catchAsync(authController.register),
);

/**
 * @swagger
 * /api/v1/school/auth/refresh:
 *   post:
 *     summary: Refresh JWT token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 */
authRoutes.post("/refresh", catchAsync(authController.refresh));

/**
 * @swagger
 * /api/v1/school/auth/logout:
 *   post:
 *     summary: User logout
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 */
authRoutes.post("/logout", catchAsync(authController.logout));

// ... Add all other routes with @swagger annotations

export default authRoutes;
