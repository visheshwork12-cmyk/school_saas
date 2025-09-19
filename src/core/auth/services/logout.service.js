// src/core/auth/services/logout.service.js
import { TokenBlacklistService } from './token-blacklist.service.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { logger } from '#utils/core/logger.js';

/**
 * Enhanced Logout Service with token blacklisting
 */
export class LogoutService {
  
  /**
   * Logout user and blacklist tokens
   */
  static async logout(accessToken, refreshToken, context) {
    try {
      const blacklistPromises = [];

      // Blacklist access token
      if (accessToken) {
        blacklistPromises.push(
          TokenBlacklistService.blacklistToken(accessToken, 'LOGOUT', context)
        );
      }

      // Blacklist refresh token
      if (refreshToken) {
        blacklistPromises.push(
          TokenBlacklistService.blacklistToken(refreshToken, 'LOGOUT', context)
        );
      }

      await Promise.all(blacklistPromises);

      await AuditService.log('USER_LOGOUT', {
        action: 'logout',
        userId: context.userId,
        tenantId: context.tenantId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent
      }, context);

      logger.info('User logged out successfully', { 
        userId: context.userId,
        tenantId: context.tenantId 
      });

      return {
        success: true,
        message: 'Logged out successfully'
      };

    } catch (error) {
      logger.error('Logout failed', { 
        error: error.message,
        userId: context.userId 
      });
      throw error;
    }
  }

  /**
   * Logout from all devices
   */
  static async logoutAllDevices(userId, tenantId, context) {
    try {
      await TokenBlacklistService.blacklistAllUserTokens(
        userId, 
        tenantId, 
        'LOGOUT_ALL_DEVICES'
      );

      await AuditService.log('USER_LOGOUT_ALL_DEVICES', {
        action: 'logout_all_devices',
        userId,
        tenantId
      }, context);

      return {
        success: true,
        message: 'Logged out from all devices successfully'
      };

    } catch (error) {
      logger.error('Logout all devices failed', { 
        error: error.message,
        userId 
      });
      throw error;
    }
  }
}
