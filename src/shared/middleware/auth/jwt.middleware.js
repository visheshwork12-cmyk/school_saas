// src/shared/middleware/auth/jwt.middleware.js
import passport from "passport";
import jwt from 'jsonwebtoken';
import catchAsync from "#utils/core/catchAsync.js";
import { AuthenticationException } from "#exceptions/authentication.exception.js";
import { logger } from "#utils/core/logger.js";
import config from '#shared/config/index.js';

/**
 * @description Enhanced JWT middleware with multiple authentication methods
 * Supports both Passport-based and direct JWT verification
 */

/**
 * @description Original Passport-based JWT middleware (your existing code enhanced)
 * Injects user context on success.
 *
 * @param {import('express').Request} req - Request.
 * @param {import('express').Response} res - Response.
 * @param {import('express').NextFunction} next - Next.
 */
const jwtMiddleware = catchAsync(async (req, res, next) => {
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err || !user) {
      logger.warn(`JWT auth failed: ${info ? info.message : "Unknown"}`, {
        path: req.path,
        method: req.method,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
      throw new AuthenticationException(
        info?.message || "Invalid or expired token",
        'JWT_AUTH_FAILED'
      );
    }

    // Enhanced user context with additional fields for file operations
    req.user = {
      ...user,
      // Ensure these fields exist for file upload operations
      userId: user.userId || user.id,
      tenantId: user.tenantId,
      permissions: user.permissions || [],
      role: user.role
    };

    logger.debug('JWT authentication successful via Passport', {
      userId: user.userId || user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role
    });

    next();
  })(req, res, next);
});

/**
 * @description Direct JWT verification middleware (for Cloudinary operations)
 * Alternative to Passport for lightweight verification
 */
const authMiddleware = catchAsync(async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationException('Access token required', 'MISSING_TOKEN');
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    if (!token) {
      throw new AuthenticationException('Access token required', 'MISSING_TOKEN');
    }
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, config.jwt.accessSecret || config.jwt.secret);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        throw new AuthenticationException('Token expired', 'TOKEN_EXPIRED');
      } else if (jwtError.name === 'JsonWebTokenError') {
        throw new AuthenticationException('Invalid token', 'INVALID_TOKEN');
      } else {
        throw new AuthenticationException('Token verification failed', 'TOKEN_VERIFICATION_FAILED');
      }
    }
    
    // Validate token payload
    if (!decoded || !decoded.userId) {
      throw new AuthenticationException('Invalid token payload', 'INVALID_TOKEN_PAYLOAD');
    }
    
    // Set user context (compatible with your existing structure)
    req.user = {
      id: decoded.userId, // For backward compatibility
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
      tenantId: decoded.tenantId,
      permissions: decoded.permissions || [],
      sessionId: decoded.sessionId,
    };
    
    logger.debug('JWT authentication successful via direct verification', {
      userId: decoded.userId,
      email: decoded.email,
      tenantId: decoded.tenantId,
      role: decoded.role
    });
    
    next();
    
  } catch (error) {
    logger.warn('Direct JWT authentication failed', {
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

/**
 * @description Optional JWT Authentication Middleware
 * Sets user context if token is provided, but doesn't fail if missing
 */
const optionalAuthMiddleware = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without user context
    req.user = null;
    return next();
  }
  
  // Token provided, use passport-based auth
  return jwtMiddleware(req, res, next);
});

/**
 * @description Hybrid middleware - tries Passport first, falls back to direct verification
 * Best of both worlds for compatibility
 */
const hybridAuthMiddleware = catchAsync(async (req, res, next) => {
  // Try Passport-based authentication first
  passport.authenticate("jwt", { session: false }, (err, user, info) => {
    if (err || !user) {
      // If Passport fails, try direct JWT verification
      logger.debug('Passport auth failed, trying direct verification', {
        error: info?.message
      });
      
      return authMiddleware(req, res, next);
    }

    // Passport succeeded
    req.user = {
      ...user,
      userId: user.userId || user.id,
      tenantId: user.tenantId,
      permissions: user.permissions || [],
      role: user.role
    };

    logger.debug('JWT authentication successful via Passport (hybrid)', {
      userId: user.userId || user.id,
      email: user.email,
      tenantId: user.tenantId
    });

    next();
  })(req, res, next);
});

/**
 * @description API Key Authentication Middleware (for external integrations)
 * Maintains your existing pattern
 */
const apiKeyMiddleware = catchAsync(async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    throw new AuthenticationException('API key required', 'MISSING_API_KEY');
  }
  
  // TODO: Implement API key validation against database
  // For now, this is a placeholder following your pattern
  
  logger.debug('API key authentication attempted', {
    apiKey: apiKey.substring(0, 8) + '...',
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
  
  next();
});

// Export your existing middleware as default + new enhanced versions
export { 
  jwtMiddleware,           // Your original enhanced middleware
  authMiddleware,         // Direct JWT verification (for Cloudinary)
  optionalAuthMiddleware, // Optional authentication
  hybridAuthMiddleware,   // Best of both worlds
  apiKeyMiddleware        // API key authentication
};

// Keep backward compatibility
export default jwtMiddleware;
