// src/api/v1/school/auth/controllers/auth.controller.js

import { catchAsync } from '#utils/core/catchAsync.js';
import { authService } from '#api/v1/school/auth/services/auth.service.js';
import { responseFormatter } from '#utils/core/responseFormatter.js';
import { logger } from '#utils/core/logger.js';

/**
 * Authentication Controller for School Management System
 * 
 * @namespace AuthController
 * @description Handles user authentication operations with multi-tenant support
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - email
 *         - password
 *         - schoolId
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: "admin@school.com"
 *         password:
 *           type: string
 *           format: password
 *           example: "SecurePass123!"
 *         schoolId:
 *           type: string
 *           example: "60d5ecb54b24a8bcf0b55abc"
 */

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: User authentication
 *     description: Authenticate user with email, password and schoolId
 *     tags: [Authentication]
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
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Login successful"
 *                 data:
 *                   type: object
 *       401:
 *         description: Authentication failed
 */

/**
 * Controller for authentication operations
 * @type {Object}
 */
const authController = {
  /**
   * Handles user login with multi-tenant support
   * 
   * @function login
   * @memberof AuthController
   * @async
   * @param {Object} req - Express request object
   * @param {string} req.body.email - User email
   * @param {string} req.body.password - User password  
   * @param {string} req.body.schoolId - School identifier
   * @param {Object} res - Express response object
   * @returns {Promise<void>} Authentication result with tokens
   * 
   * @example
   * // POST /api/v1/auth/login
   * {
   *   "email": "admin@school.com",
   *   "password": "SecurePass123!",
   *   "schoolId": "60d5ecb54b24a8bcf0b55abc"
   * }
   */
  login: catchAsync(async (req, res) => {
    const { email, password, schoolId } = req.body;
    const tokens = await authService.login({ email, password, schoolId }, req.tenant);
    responseFormatter.success(res, 'Login successful', tokens);
  }),

  /**
   * Handles user registration in multi-tenant context
   * 
   * @function register
   * @memberof AuthController
   * @async
   * @param {Object} req - Express request object with user data
   * @param {Object} res - Express response object
   * @returns {Promise<void>} Registration result with user data
   */
  register: catchAsync(async (req, res) => {
    const userData = req.body;
    const user = await authService.register(userData, req.tenant);
    responseFormatter.success(res, 'Registration successful', user, 201);
  }),

  /**
   * Handles JWT token refresh
   * 
   * @function refresh  
   * @memberof AuthController
   * @async
   * @param {Object} req - Express request object with refresh token
   * @param {Object} res - Express response object
   * @returns {Promise<void>} New access and refresh tokens
   */
  refresh: catchAsync(async (req, res) => {
    const { refreshToken } = req.body;
    const newTokens = await authService.refreshToken(refreshToken);
    responseFormatter.success(res, 'Token refreshed', newTokens);
  }),

  /**
   * Handles user logout and token invalidation
   * 
   * @function logout
   * @memberof AuthController  
   * @async
   * @param {Object} req - Express request object with auth headers
   * @param {Object} res - Express response object
   * @returns {Promise<void>} Logout confirmation
   */
  logout: catchAsync(async (req, res) => {
    await authService.logout(req.user.id, req.headers.authorization.split(' ')[1]);
    responseFormatter.success(res, 'Logout successful');
  })
};

export { authController };
