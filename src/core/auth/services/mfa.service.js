// src/core/auth/services/mfa.service.js
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { logger } from '#utils/core/logger.js';
import { CacheService } from '#core/cache/services/unified-cache.service.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { AuthenticationException } from '#shared/exceptions/authentication.exception.js';
import baseConfig from '#shared/config/environments/base.config.js';

/**
 * Hardware MFA Service with TOTP support
 * Supports hardware tokens like YubiKey, Google Authenticator, Authy
 */
export class MFAService {
  /**
   * Generate MFA secret for user
   */
  static async generateMFASecret(userId, userEmail, tenantId) {
    try {
      const secret = speakeasy.generateSecret({
        name: `School ERP (${userEmail})`,
        issuer: baseConfig.auth.mfa.issuer || 'School ERP SaaS',
        length: 32
      });

      // Store secret temporarily for verification
      const cacheKey = `mfa_setup:${tenantId}:${userId}`;
      await CacheService.set(cacheKey, {
        secret: secret.base32,
        tempSecret: true,
        createdAt: new Date().toISOString()
      }, 900, tenantId); // 15 minutes expiry

      // Generate QR code for hardware authenticator apps
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      await AuditService.log('MFA_SECRET_GENERATED', {
        action: 'generate_mfa_secret',
        userId,
        tenantId
      }, { tenantId, userId });

      return {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        manualEntryKey: secret.base32,
        backupCodes: this.generateBackupCodes()
      };

    } catch (error) {
      logger.error('MFA secret generation failed', { 
        error: error.message, 
        userId, 
        tenantId 
      });
      throw new AuthenticationException('Failed to generate MFA secret');
    }
  }

  /**
   * Verify TOTP token from hardware device
   */
  static async verifyTOTP(userId, token, tenantId, isSetup = false) {
    try {
      let secret;
      
      if (isSetup) {
        // During setup, get secret from cache
        const cacheKey = `mfa_setup:${tenantId}:${userId}`;
        const setupData = await CacheService.get(cacheKey, tenantId);
        if (!setupData || !setupData.tempSecret) {
          throw new AuthenticationException('MFA setup session expired');
        }
        secret = setupData.secret;
      } else {
        // During login, get secret from user record
        const UserModel = (await import('#domain/models/school/user.model.js')).default;
        const user = await UserModel.findOne({ 
          _id: userId, 
          tenantId,
          'mfa.enabled': true 
        }).select('mfa.secret');
        
        if (!user || !user.mfa?.secret) {
          throw new AuthenticationException('MFA not configured for user');
        }
        secret = user.mfa.secret;
      }

      // Verify TOTP with time window
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token: token.replace(/\s/g, ''), // Remove any spaces
        window: baseConfig.auth.mfa.windowSize || 1,
        step: 30
      });

      if (!verified) {
        await AuditService.log('MFA_VERIFICATION_FAILED', {
          action: 'verify_totp',
          userId,
          tenantId,
          isSetup
        }, { tenantId, userId });
        
        throw new AuthenticationException('Invalid MFA token');
      }

      await AuditService.log('MFA_VERIFICATION_SUCCESS', {
        action: 'verify_totp',
        userId,
        tenantId,
        isSetup
      }, { tenantId, userId });

      return true;

    } catch (error) {
      logger.error('TOTP verification failed', { 
        error: error.message, 
        userId, 
        tenantId 
      });
      throw error;
    }
  }

  /**
   * Enable MFA for user after successful verification
   */
  static async enableMFA(userId, verificationToken, tenantId) {
    try {
      // Verify the token first
      await this.verifyTOTP(userId, verificationToken, tenantId, true);

      // Get the secret from cache
      const cacheKey = `mfa_setup:${tenantId}:${userId}`;
      const setupData = await CacheService.get(cacheKey, tenantId);
      
      const UserModel = (await import('#domain/models/school/user.model.js')).default;
      
      // Save MFA configuration to user
      await UserModel.findByIdAndUpdate(userId, {
        $set: {
          'mfa.enabled': true,
          'mfa.secret': setupData.secret,
          'mfa.enabledAt': new Date(),
          'mfa.backupCodes': this.generateBackupCodes()
        }
      });

      // Clear setup cache
      await CacheService.invalidate(`mfa_setup:${tenantId}:${userId}`, tenantId);

      await AuditService.log('MFA_ENABLED', {
        action: 'enable_mfa',
        userId,
        tenantId
      }, { tenantId, userId });

      return {
        enabled: true,
        backupCodes: setupData.backupCodes
      };

    } catch (error) {
      logger.error('MFA enable failed', { 
        error: error.message, 
        userId, 
        tenantId 
      });
      throw error;
    }
  }

  /**
   * Generate backup codes for account recovery
   */
  static generateBackupCodes() {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      // Generate 8-digit backup codes
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Verify backup code
   */
  static async verifyBackupCode(userId, backupCode, tenantId) {
    try {
      const UserModel = (await import('#domain/models/school/user.model.js')).default;
      
      const user = await UserModel.findOne({
        _id: userId,
        tenantId,
        'mfa.enabled': true,
        'mfa.backupCodes': backupCode.toUpperCase()
      });

      if (!user) {
        throw new AuthenticationException('Invalid backup code');
      }

      // Remove used backup code
      await UserModel.findByIdAndUpdate(userId, {
        $pull: { 'mfa.backupCodes': backupCode.toUpperCase() }
      });

      await AuditService.log('MFA_BACKUP_CODE_USED', {
        action: 'verify_backup_code',
        userId,
        tenantId
      }, { tenantId, userId });

      return true;

    } catch (error) {
      logger.error('Backup code verification failed', { 
        error: error.message, 
        userId, 
        tenantId 
      });
      throw error;
    }
  }

  /**
   * Check if MFA is required for user role
   */
  static isMFARequired(userRole) {
    const mfaRequiredRoles = [
      'SUPER_ADMIN',
      'PLATFORM_ADMIN', 
      'SCHOOL_ADMIN',
      'PRINCIPAL'
    ];
    return mfaRequiredRoles.includes(userRole);
  }
}
