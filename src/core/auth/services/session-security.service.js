// src/core/auth/services/session-security.service.js
import { CacheService } from '#core/cache/services/unified-cache.service.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { logger } from '#utils/core/logger.js';
import { AuthenticationException } from '#shared/exceptions/authentication.exception.js';
import crypto from 'crypto';

/**
 * Session Security Service for hijacking protection
 */
export class SessionSecurityService {

  /**
   * Create secure session with IP binding
   */
  static async createSecureSession(userId, tenantId, sessionData) {
    try {
      const sessionId = this.generateSecureSessionId();
      const sessionKey = `session:${tenantId}:${userId}:${sessionId}`;

      const secureSession = {
        sessionId,
        userId,
        tenantId,
        createdAt: new Date().toISOString(),
        lastAccessAt: new Date().toISOString(),
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
        fingerprint: sessionData.fingerprint,
        isValid: true,
        securityLevel: this.calculateSecurityLevel(sessionData),
        // IP validation settings
        strictIpValidation: sessionData.strictIpValidation || false,
        allowedIpRange: this.getIpRange(sessionData.ipAddress),
        // Security flags
        flags: {
          suspiciousActivity: false,
          locationChanged: false,
          deviceChanged: false
        }
      };

      // Store session with TTL
      const ttl = 24 * 60 * 60; // 24 hours
      await CacheService.set(sessionKey, secureSession, ttl, tenantId);

      // Update user's active sessions list
      await this.updateActiveSessionsList(userId, tenantId, sessionId, 'ADD');

      await AuditService.log('SECURE_SESSION_CREATED', {
        action: 'create_secure_session',
        sessionId,
        userId,
        tenantId,
        ipAddress: sessionData.ipAddress,
        securityLevel: secureSession.securityLevel
      }, { tenantId, userId });

      return {
        sessionId,
        securityLevel: secureSession.securityLevel
      };

    } catch (error) {
      logger.error('Secure session creation failed', { 
        error: error.message,
        userId,
        tenantId 
      });
      throw error;
    }
  }

  /**
   * Validate session with IP and security checks
   */
  static async validateSession(sessionId, userId, tenantId, requestData) {
    try {
      const sessionKey = `session:${tenantId}:${userId}:${sessionId}`;
      const session = await CacheService.get(sessionKey, tenantId);

      if (!session || !session.isValid) {
        throw new AuthenticationException('Invalid or expired session', 'INVALID_SESSION');
      }

      // IP validation
      const ipValidation = this.validateIpAddress(
        session.ipAddress, 
        requestData.ipAddress,
        session.strictIpValidation,
        session.allowedIpRange
      );

      if (!ipValidation.valid) {
        await this.flagSuspiciousActivity(sessionId, userId, tenantId, {
          reason: 'IP_MISMATCH',
          originalIp: session.ipAddress,
          currentIp: requestData.ipAddress,
          severity: ipValidation.severity
        });

        if (ipValidation.severity === 'HIGH') {
          await this.invalidateSession(sessionId, userId, tenantId, 'IP_SECURITY_VIOLATION');
          throw new AuthenticationException('Session security violation detected', 'SESSION_HIJACKING_DETECTED');
        }
      }

      // User Agent validation
      const uaValidation = this.validateUserAgent(session.userAgent, requestData.userAgent);
      if (!uaValidation.valid && uaValidation.severity === 'HIGH') {
        await this.flagSuspiciousActivity(sessionId, userId, tenantId, {
          reason: 'USER_AGENT_MISMATCH',
          originalUA: session.userAgent,
          currentUA: requestData.userAgent
        });
      }

      // Device fingerprint validation
      if (session.fingerprint && requestData.fingerprint) {
        const fingerprintValid = this.validateFingerprint(
          session.fingerprint, 
          requestData.fingerprint
        );
        
        if (!fingerprintValid) {
          await this.flagSuspiciousActivity(sessionId, userId, tenantId, {
            reason: 'DEVICE_FINGERPRINT_MISMATCH'
          });
        }
      }

      // Update session activity
      session.lastAccessAt = new Date().toISOString();
      session.lastIpAddress = requestData.ipAddress;
      await CacheService.set(sessionKey, session, 24 * 60 * 60, tenantId);

      return {
        valid: true,
        session,
        securityWarnings: ipValidation.warnings || []
      };

    } catch (error) {
      logger.error('Session validation failed', { 
        error: error.message,
        sessionId,
        userId 
      });
      throw error;
    }
  }

  /**
   * Validate IP address with various levels of strictness
   */
  static validateIpAddress(originalIp, currentIp, strictValidation, allowedRange) {
    if (originalIp === currentIp) {
      return { valid: true, severity: 'NONE' };
    }

    if (!strictValidation) {
      // Check if IPs are in same subnet/range
      if (this.areIpsInSameRange(originalIp, currentIp, allowedRange)) {
        return { 
          valid: true, 
          severity: 'LOW',
          warnings: ['IP changed within allowed range']
        };
      }
    }

    // Check if it's a private network change (less suspicious)
    if (this.isPrivateNetworkChange(originalIp, currentIp)) {
      return {
        valid: true,
        severity: 'MEDIUM',
        warnings: ['IP changed within private network']
      };
    }

    // Public IP change - more suspicious
    return {
      valid: false,
      severity: strictValidation ? 'HIGH' : 'MEDIUM',
      warnings: ['Public IP address changed - potential security risk']
    };
  }

  /**
   * Check if IPs are in the same range/subnet
   */
  static areIpsInSameRange(ip1, ip2, allowedRange) {
    if (!allowedRange) return false;
    
    try {
      // Simple subnet check - could be enhanced with proper CIDR validation
      const range = allowedRange.split('/')[1] || 24;
      const subnet1 = ip1.split('.').slice(0, Math.ceil(range / 8)).join('.');
      const subnet2 = ip2.split('.').slice(0, Math.ceil(range / 8)).join('.');
      
      return subnet1 === subnet2;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if IP change is within private networks
   */
  static isPrivateNetworkChange(ip1, ip2) {
    const isPrivate = (ip) => {
      return /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(ip);
    };
    
    return isPrivate(ip1) && isPrivate(ip2);
  }

  /**
   * Validate User Agent for device consistency
   */
  static validateUserAgent(originalUA, currentUA) {
    if (!originalUA || !currentUA) {
      return { valid: true, severity: 'LOW' };
    }

    if (originalUA === currentUA) {
      return { valid: true, severity: 'NONE' };
    }

    // Extract major browser and OS info
    const extractInfo = (ua) => {
      const browser = ua.match(/(Chrome|Firefox|Safari|Edge|Opera)\/[\d.]+/)?.[0] || '';
      const os = ua.match(/(Windows|MacOS|Linux|Android|iOS)[\s\d._]*/)?.[0] || '';
      return { browser, os };
    };

    const original = extractInfo(originalUA);
    const current = extractInfo(currentUA);

    // Same browser and OS - likely version update
    if (original.browser === current.browser && original.os === current.os) {
      return { valid: true, severity: 'LOW' };
    }

    // Different browser or OS - more suspicious
    return {
      valid: false,
      severity: 'MEDIUM',
      warnings: ['Device or browser changed']
    };
  }

  /**
   * Validate device fingerprint
   */
  static validateFingerprint(originalFingerprint, currentFingerprint) {
    if (!originalFingerprint || !currentFingerprint) return true;
    
    // Simple fingerprint comparison - could be enhanced with fuzzy matching
    return originalFingerprint === currentFingerprint;
  }

  /**
   * Flag suspicious activity
   */
  static async flagSuspiciousActivity(sessionId, userId, tenantId, activityData) {
    try {
      const flagKey = `suspicious:${tenantId}:${userId}:${sessionId}`;
      
      await CacheService.set(flagKey, {
        ...activityData,
        flaggedAt: new Date().toISOString(),
        severity: activityData.severity || 'MEDIUM'
      }, 3600, tenantId); // 1 hour

      await AuditService.log('SUSPICIOUS_ACTIVITY_DETECTED', {
        action: 'flag_suspicious_activity',
        sessionId,
        userId,
        tenantId,
        ...activityData
      }, { tenantId, userId });

      logger.warn('Suspicious activity flagged', {
        sessionId,
        userId,
        reason: activityData.reason
      });

    } catch (error) {
      logger.error('Failed to flag suspicious activity', { error: error.message });
    }
  }

  /**
   * Invalidate session for security reasons
   */
  static async invalidateSession(sessionId, userId, tenantId, reason) {
    try {
      const sessionKey = `session:${tenantId}:${userId}:${sessionId}`;
      
      // Mark session as invalid
      const session = await CacheService.get(sessionKey, tenantId);
      if (session) {
        session.isValid = false;
        session.invalidatedAt = new Date().toISOString();
        session.invalidationReason = reason;
        await CacheService.set(sessionKey, session, 300, tenantId); // Keep for 5 minutes for audit
      }

      // Remove from active sessions
      await this.updateActiveSessionsList(userId, tenantId, sessionId, 'REMOVE');

      await AuditService.log('SESSION_INVALIDATED', {
        action: 'invalidate_session',
        sessionId,
        userId,
        tenantId,
        reason
      }, { tenantId, userId });

    } catch (error) {
      logger.error('Session invalidation failed', { error: error.message });
    }
  }

  /**
   * Generate secure session ID
   */
  static generateSecureSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Calculate security level based on session data
   */
  static calculateSecurityLevel(sessionData) {
    let level = 'STANDARD';
    
    if (sessionData.mfaVerified) level = 'HIGH';
    if (sessionData.isAdminUser) level = 'HIGH';
    if (sessionData.fromTrustedNetwork) level = 'STANDARD';
    if (sessionData.vpnDetected) level = 'MEDIUM';
    
    return level;
  }

  /**
   * Get IP range for validation
   */
  static getIpRange(ipAddress) {
    // Default to /24 subnet for IPv4
    return `${ipAddress}/24`;
  }

  /**
   * Update user's active sessions list
   */
  static async updateActiveSessionsList(userId, tenantId, sessionId, action) {
    try {
      const activeSessionsKey = `active_sessions:${tenantId}:${userId}`;
      let activeSessions = await CacheService.get(activeSessionsKey, tenantId) || [];

      if (action === 'ADD') {
        activeSessions.push({
          sessionId,
          createdAt: new Date().toISOString()
        });
        
        // Limit to 5 concurrent sessions
        if (activeSessions.length > 5) {
          activeSessions = activeSessions.slice(-5);
        }
      } else if (action === 'REMOVE') {
        activeSessions = activeSessions.filter(s => s.sessionId !== sessionId);
      }

      await CacheService.set(activeSessionsKey, activeSessions, 7 * 24 * 60 * 60, tenantId);

    } catch (error) {
      logger.error('Failed to update active sessions list', { error: error.message });
    }
  }
}
