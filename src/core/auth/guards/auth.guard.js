// src/core/auth/guards/auth.guard.js

import { jwtService } from '#core/auth/services/jwt.service.js';
import catchAsync from '#utils/core/catchAsync.js';
import { AuthenticationException } from '#exceptions/authentication.exception.js';

/**
 * @description Authentication guard middleware using JWT.
 * Verifies token from header and sets user on req.
 * 
 * @param {express.Request} req - The request object.
 * @param {express.Response} res - The response object.
 * @param {express.NextFunction} next - The next middleware function.
 */
const authGuard = catchAsync(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AuthenticationException('No token provided');
  }

  const token = authHeader.split(' ')[1];
  const decoded = jwtService.verify(token);

  // Set user context (for RBAC, etc.)
  req.user = decoded;

  next();
});

export { authGuard };