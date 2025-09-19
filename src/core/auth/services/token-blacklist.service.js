// src/core/auth/services/token-blacklist.service.js
import { CacheService } from '#core/cache/services/unified-cache.service.js';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import baseConfig from '#shared/config/environments/base.config.js';
import jwt from 'jsonwebtoken';

/**
 * JWT Token Blacklisting Service for secure logout
 */
export class TokenBlacklistService {
  
  /**
   * Add token to blacklist
   */
  static async blacklistToken(token, reason = 'LOGOUT', context = {}) {
    try {
      // Decode token to get expiry time
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        logger.warn('Invalid token for blacklisting');
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp - now;

      // Only blacklist if token hasn't expired yet
      if (ttl > 0) {
        const blacklistKey = `blacklist:${this.getTokenHash(token)}`;
        
        await CacheService.set(blacklistKey, {
          reason,
          blacklistedAt: new Date().toISOString(),
          userId: decoded.userId || decoded.sub,
          tenantId: decoded.tenantId,
          exp: decoded.exp
        }, ttl, context.tenantId || 'default');

        // Also blacklist by JTI if available
        if (decoded.jti) {
          const jtiKey = `blacklist:jti:${decoded.jti}`;
          await CacheService.set(jtiKey, {
            reason,
            blacklistedAt: new Date().toISOString()
          }, ttl, context.tenantId || 'default');
        }

        await AuditService.log('TOKEN_BLACKLISTED', {
          action: 'blacklist_token',
          reason,
          userId: decoded.userId || decoded.sub,
          tenantId: decoded.tenantId,
          tokenType: decoded.type || 'access'
        }, context);

        logger.debug('Token blacklisted successfully', { 
          userId: decoded.userId || decoded.sub,
          reason 
        });

        return true;
      }

      return false;

    } catch (error) {
      logger.error('Token blacklisting failed', { 
        error: error.message,
        reason 
      });
      throw error;
    }
  }

  /**
   * Check if token is blacklisted
   */
  static async isTokenBlacklisted(token, tenantId = 'default') {
    try {
      const decoded = jwt.decode(token);
      if (!decoded) {
        return true; // Invalid tokens are considered blacklisted
      }

      // Check by token hash
      const blacklistKey = `blacklist:${this.getTokenHash(token)}`;
      const blacklisted = await CacheService.get(blacklistKey, tenantId);
      
      if (blacklisted) {
        return true;
      }

      // Check by JTI if available
      if (decoded.jti) {
        const jtiKey = `blacklist:jti:${decoded.jti}`;
        const jtiBlacklisted = await CacheService.get(jtiKey, tenantId);
        if (jtiBlacklisted) {
          return true;
        }
      }

      return false;

    } catch (error) {
      logger.error('Blacklist check failed', { error: error.message });
      // In case of error, be conservative and consider token blacklisted
      return true;
    }
  }

  /**
   * Blacklist all tokens for a user (useful for security incidents)
   */
  static async blacklistAllUserTokens(userId, tenantId, reason = 'SECURITY_INCIDENT') {
    try {
      // Set a user-level blacklist entry
      const userBlacklistKey = `blacklist:user:${tenantId}:${userId}`;
      const blacklistUntil = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours
      
      await CacheService.set(userBlacklistKey, {
        reason,
        blacklistedAt: new Date().toISOString(),
        blacklistUntil
      }, 24 * 60 * 60, tenantId); // 24 hours TTL

      await AuditService.log('USER_TOKENS_BLACKLISTED', {
        action: 'blacklist_all_user_tokens',
        userId,
        tenantId,
        reason
      }, { tenantId, userId });

      logger.info('All user tokens blacklisted', { userId, tenantId, reason });

      return true;

    } catch (error) {
      logger.error('User tokens blacklisting failed', { 
        error: error.message,
        userId,
        tenantId 
      });
      throw error;
    }
  }

  /**
   * Check if user has active blacklist
   */
  static async isUserBlacklisted(userId, tenantId = 'default') {
    try {
      const userBlacklistKey = `blacklist:user:${tenantId}:${userId}`;
      const blacklistData = await CacheService.get(userBlacklistKey, tenantId);
      
      if (!blacklistData) {
        return false;
      }

      const now = Math.floor(Date.now() / 1000);
      return now < blacklistData.blacklistUntil;

    } catch (error) {
      logger.error('User blacklist check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Generate token hash for blacklist storage
   */
  static getTokenHash(token) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Clean up expired blacklist entries (cron job)
   */
  static async cleanupExpiredEntries() {
    try {
      // This would be implemented based on your Redis/Cache implementation
      // Most cache systems auto-expire entries, so this might not be needed
      logger.debug('Blacklist cleanup completed');
    } catch (error) {
      logger.error('Blacklist cleanup failed', { error: error.message });
    }
  }
}
