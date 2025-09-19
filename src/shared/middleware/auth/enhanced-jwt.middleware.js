// src/shared/middleware/auth/enhanced-jwt.middleware.js
import jwt from 'jsonwebtoken';
import { TokenBlacklistService } from '#core/auth/services/token-blacklist.service.js';
import { AuthenticationException } from '#shared/exceptions/authentication.exception.js';
import { logger } from '#utils/core/logger.js';
import catchAsync from '#utils/core/catchAsync.js';
import baseConfig from '#shared/config/environments/base.config.js';

/**
 * Enhanced JWT middleware with blacklist checking
 */
export const enhancedJwtMiddleware = catchAsync(async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationException('Access token required', 'MISSING_TOKEN');
    }

    const token = authHeader.substring(7);
    if (!token) {
      throw new AuthenticationException('Access token required', 'MISSING_TOKEN');
    }

    // Check if token is blacklisted
    const isBlacklisted = await TokenBlacklistService.isTokenBlacklisted(
      token, 
      req.headers['x-tenant-id'] || 'default'
    );

    if (isBlacklisted) {
      throw new AuthenticationException('Token has been invalidated', 'TOKEN_BLACKLISTED');
    }

    // Verify JWT token
    let decoded;
    try {
      decoded = jwt.verify(token, baseConfig.jwt.accessSecret);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        throw new AuthenticationException('Token expired', 'TOKEN_EXPIRED');
      } else if (jwtError.name === 'JsonWebTokenError') {
        throw new AuthenticationException('Invalid token', 'INVALID_TOKEN');
      } else {
        throw new AuthenticationException('Token verification failed', 'TOKEN_VERIFICATION_FAILED');
      }
    }

    // Check if user is blacklisted
    if (decoded.userId || decoded.sub) {
      const userBlacklisted = await TokenBlacklistService.isUserBlacklisted(
        decoded.userId || decoded.sub,
        decoded.tenantId || 'default'
      );

      if (userBlacklisted) {
        throw new AuthenticationException('User access revoked', 'USER_BLACKLISTED');
      }
    }

    // Set user context
    req.user = {
      id: decoded.userId || decoded.sub,
      userId: decoded.userId || decoded.sub,
      email: decoded.email,
      role: decoded.role,
      tenantId: decoded.tenantId,
      permissions: decoded.permissions || [],
      sessionId: decoded.sessionId,
      jti: decoded.jti
    };

    next();

  } catch (error) {
    logger.warn('Enhanced JWT authentication failed', {
      error: error.message,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });

    if (error instanceof AuthenticationException) {
      return res.status(401).json({
        success: false,
        error: {
          code: error.code,
          message: error.message,
          type: 'AUTHENTICATION_ERROR'
        }
      });
    }

    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'Authentication failed',
        type: 'AUTHENTICATION_ERROR'
      }
    });
  }
});
