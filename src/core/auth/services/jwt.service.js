// src/core/auth/services/jwt.service.js

import jwt from 'jsonwebtoken';
import config from '#config/index.js';
import { logger } from '#utils/core/logger.js';
import { AuthenticationException } from '#exceptions/authentication.exception.js';

/**
 * JWT Token Management Service for School Management System
 * 
 * This service provides secure JWT token generation and verification functionality
 * with comprehensive error handling and logging for multi-tenant architecture.
 * 
 * @class JwtService
 * @category Core Services
 * @subcategory Authentication
 * @since 1.0.0
 * @author Development Team
 * 
 * @example
 * ```
 * import { jwtService } from '#core/auth/services/jwt.service.js';
 * 
 * // Generate token
 * const token = jwtService.sign({
 *   userId: '60d5ecb54b24a8bcf0b55ad2',
 *   schoolId: '60d5ecb54b24a8bcf0b55abc',
 *   role: 'teacher'
 * });
 * 
 * // Verify token
 * const payload = jwtService.verify(token);
 * ```
 */
class JwtService {
  /**
   * Generate JWT access token with payload and custom expiry
   * 
   * @param {Object} payload - Token payload containing user information
   * @param {string} payload.userId - Unique user identifier
   * @param {string} [payload.schoolId] - School identifier for multi-tenant context
   * @param {string} [payload.role] - User role (admin, teacher, student, parent)
   * @param {string} [payload.email] - User email address
   * @param {Object} [payload.permissions] - User permissions object
   * @param {string} [expiresIn=config.jwt.expiry] - Token expiration time (e.g., '1h', '30m', '7d')
   * 
   * @returns {string} Generated JWT token string
   * 
   * @throws {AuthenticationException} When payload is invalid or token generation fails
   * 
   * @example
   * ```
   * // Basic token generation
   * const accessToken = jwtService.sign({
   *   userId: '60d5ecb54b24a8bcf0b55ad2',
   *   schoolId: '60d5ecb54b24a8bcf0b55abc',
   *   role: 'teacher'
   * });
   * 
   * // Token with custom expiry
   * const refreshToken = jwtService.sign({
   *   userId: '60d5ecb54b24a8bcf0b55ad2',
   *   type: 'refresh'
   * }, '7d');
   * 
   * // Token with permissions
   * const adminToken = jwtService.sign({
   *   userId: '60d5ecb54b24a8bcf0b55ad2',
   *   schoolId: '60d5ecb54b24a8bcf0b55abc',
   *   role: 'admin',
   *   permissions: {
   *     canManageUsers: true,
   *     canViewReports: true,
   *     canManageSchool: true
   *   }
   * });
   * ```
   * 
   * @since 1.0.0
   */
  sign(payload, expiresIn = config.jwt.expiry) {
    try {
      // Validate payload
      if (!payload || typeof payload !== 'object') {
        throw new Error('Invalid payload: must be a non-empty object');
      }

      // Add standard claims
      const tokenPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        iss: config.jwt.issuer || 'school-management-system'
      };

      const token = jwt.sign(tokenPayload, config.jwt.secret, { 
        expiresIn,
        algorithm: config.jwt.algorithm || 'HS256'
      });

      logger.info('JWT token generated successfully', {
        userId: payload.userId,
        schoolId: payload.schoolId,
        role: payload.role,
        expiresIn
      });

      return token;

    } catch (err) {
      logger.error('JWT token generation failed', {
        error: err.message,
        payload: payload ? { ...payload, password: undefined } : 'invalid',
        stack: err.stack
      });
      throw new AuthenticationException('Token generation failed', 'TOKEN_GENERATION_ERROR');
    }
  }

  /**
   * Verify and decode JWT token with comprehensive error handling
   * 
   * @param {string} token - JWT token string to verify
   * @param {Object} [options={}] - Verification options
   * @param {boolean} [options.ignoreExpiration=false] - Skip expiration check
   * @param {string[]} [options.audience] - Expected audience values
   * @param {string} [options.issuer] - Expected issuer
   * @param {number} [options.clockTolerance=0] - Clock tolerance in seconds
   * 
   * @returns {Object} Decoded token payload with user information
   * @returns {string} returns.userId - User identifier from token
   * @returns {string} [returns.schoolId] - School identifier from token
   * @returns {string} [returns.role] - User role from token
   * @returns {number} returns.iat - Token issued at timestamp
   * @returns {number} returns.exp - Token expiration timestamp
   * 
   * @throws {AuthenticationException} When token is invalid, expired, or malformed
   * 
   * @example
   * ```
   * try {
   *   // Basic token verification
   *   const payload = jwtService.verify(token);
   *   console.log('User ID:', payload.userId);
   *   console.log('School ID:', payload.schoolId);
   *   console.log('Role:', payload.role);
   * 
   *   // Verification with options
   *   const payload = jwtService.verify(token, {
   *     ignoreExpiration: false,
   *     issuer: 'school-management-system',
   *     clockTolerance: 60
   *   });
   * 
   * } catch (error) {
   *   if (error instanceof AuthenticationException) {
   *     console.error('Token verification failed:', error.message);
   *   }
   * }
   * ```
   * 
   * @since 1.0.0
   */
  verify(token, options = {}) {
    try {
      // Validate token format
      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token: must be a non-empty string');
      }

      // Remove Bearer prefix if present
      const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

      // Verify token with options
      const verifyOptions = {
        algorithms: [config.jwt.algorithm || 'HS256'],
        issuer: options.issuer || config.jwt.issuer,
        ignoreExpiration: options.ignoreExpiration || false,
        clockTolerance: options.clockTolerance || 0,
        ...options
      };

      const decoded = jwt.verify(cleanToken, config.jwt.secret, verifyOptions);

      logger.info('JWT token verified successfully', {
        userId: decoded.userId,
        schoolId: decoded.schoolId,
        role: decoded.role,
        tokenType: decoded.type || 'access'
      });

      return decoded;

    } catch (err) {
      let errorMessage = 'Invalid or expired token';
      let errorCode = 'TOKEN_INVALID';

      // Handle specific JWT errors
      if (err.name === 'TokenExpiredError') {
        errorMessage = 'Token has expired';
        errorCode = 'TOKEN_EXPIRED';
      } else if (err.name === 'JsonWebTokenError') {
        errorMessage = 'Invalid token format';
        errorCode = 'TOKEN_MALFORMED';
      } else if (err.name === 'NotBeforeError') {
        errorMessage = 'Token not active yet';
        errorCode = 'TOKEN_NOT_ACTIVE';
      }

      logger.warn('JWT token verification failed', {
        error: err.message,
        errorType: err.name,
        token: token ? `${token.substring(0, 20)}...` : 'missing'
      });

      throw new AuthenticationException(errorMessage, errorCode);
    }
  }

  /**
   * Decode JWT token without verification (for inspection only)
   * 
   * @param {string} token - JWT token to decode
   * @returns {Object|null} Decoded token payload or null if invalid
   * 
   * @example
   * ```
   * const payload = jwtService.decode(token);
   * if (payload) {
   *   console.log('Token expires at:', new Date(payload.exp * 1000));
   * }
   * ```
   * 
   * @since 1.0.0
   */
  decode(token) {
    try {
      return jwt.decode(token);
    } catch (err) {
      logger.warn('JWT token decode failed', { error: err.message });
      return null;
    }
  }

  /**
   * Check if token is expired without throwing error
   * 
   * @param {string} token - JWT token to check
   * @returns {boolean} True if token is expired
   * 
   * @example
   * ```
   * if (jwtService.isExpired(token)) {
   *   console.log('Token needs refresh');
   * }
   * ```
   * 
   * @since 1.0.0
   */
  isExpired(token) {
    try {
      const decoded = this.decode(token);
      if (!decoded || !decoded.exp) {return true;}
      return Date.now() >= decoded.exp * 1000;
    } catch {
      return true;
    }
  }
}

/**
 * Singleton instance of JwtService
 * @type {JwtService}
 */
const jwtService = new JwtService();

export { jwtService };
