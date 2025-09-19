// src/core/auth/middleware/mfa.middleware.js
import { MFAService } from '../services/mfa.service.js';
import { AuthenticationException } from '#shared/exceptions/authentication.exception.js';
import { logger } from '#utils/core/logger.js';
import catchAsync from '#utils/core/catchAsync.js';

/**
 * MFA validation middleware for critical admin operations
 */
export const requireMFA = catchAsync(async (req, res, next) => {
  const user = req.user;
  
  if (!user) {
    throw new AuthenticationException('Authentication required');
  }

  // Check if MFA is required for user role
  const mfaRequired = MFAService.isMFARequired(user.role);
  
  if (mfaRequired) {
    const mfaToken = req.headers['x-mfa-token'];
    
    if (!mfaToken) {
      return res.status(428).json({
        success: false,
        error: {
          code: 'MFA_REQUIRED',
          message: 'MFA token required for this operation'
        },
        requiresMFA: true
      });
    }

    // Verify MFA token
    try {
      await MFAService.verifyTOTP(user.id, mfaToken, user.tenantId);
      logger.debug('MFA verification successful', { 
        userId: user.id, 
        action: req.path 
      });
    } catch (error) {
      throw new AuthenticationException('Invalid MFA token');
    }
  }

  next();
});

/**
 * MFA setup middleware
 */
export const mfaSetupRequired = catchAsync(async (req, res, next) => {
  const user = req.user;
  
  if (!user) {
    throw new AuthenticationException('Authentication required');
  }

  const UserModel = (await import('#domain/models/school/user.model.js')).default;
  const userRecord = await UserModel.findById(user.id).select('mfa role');
  
  const mfaRequired = MFAService.isMFARequired(userRecord.role);
  const mfaConfigured = userRecord.mfa?.enabled;

  if (mfaRequired && !mfaConfigured) {
    return res.status(428).json({
      success: false,
      error: {
        code: 'MFA_SETUP_REQUIRED',
        message: 'MFA setup required for your role'
      },
      requiresMFASetup: true
    });
  }

  next();
});
