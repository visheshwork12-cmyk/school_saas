// src/core/auth/services/device-fingerprint.service.js
import crypto from 'crypto';
import { CacheService } from '#core/cache/services/unified-cache.service.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { logger } from '#utils/core/logger.js';

/**
 * Device Fingerprinting Service for suspicious activity detection
 */
export class DeviceFingerprintService {

  /**
   * Generate device fingerprint from request data
   */
  static generateFingerprint(fingerprintData) {
    try {
      const {
        userAgent,
        screenResolution,
        timezone,
        language,
        platform,
        cookieEnabled,
        doNotTrack,
        plugins,
        canvas,
        webgl,
        fonts,
        audioContext,
        webrtc
      } = fingerprintData;

      // Create fingerprint components
      const components = [
        userAgent || '',
        screenResolution || '',
        timezone || '',
        language || '',
        platform || '',
        cookieEnabled ? '1' : '0',
        doNotTrack || '',
        (plugins || []).sort().join(','),
        canvas || '',
        webgl || '',
        (fonts || []).sort().join(','),
        audioContext || '',
        webrtc || ''
      ];

      // Generate hash
      const fingerprint = crypto
        .createHash('sha256')
        .update(components.join('|'))
        .digest('hex');

      return {
        fingerprint,
        components: {
          userAgent: !!userAgent,
          screenResolution: !!screenResolution,
          timezone: !!timezone,
          language: !!language,
          platform: !!platform,
          cookieEnabled: !!cookieEnabled,
          plugins: (plugins || []).length,
          canvas: !!canvas,
          webgl: !!webgl,
          fonts: (fonts || []).length,
          audioContext: !!audioContext,
          webrtc: !!webrtc
        },
        confidence: this.calculateConfidence(fingerprintData)
      };

    } catch (error) {
      logger.error('Fingerprint generation failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate fingerprint confidence level
   */
  static calculateConfidence(fingerprintData) {
    let score = 0;
    let maxScore = 0;

    const checks = [
      { key: 'userAgent', weight: 10 },
      { key: 'screenResolution', weight: 15 },
      { key: 'timezone', weight: 8 },
      { key: 'language', weight: 5 },
      { key: 'platform', weight: 8 },
      { key: 'plugins', weight: 12 },
      { key: 'canvas', weight: 20 },
      { key: 'webgl', weight: 15 },
      { key: 'fonts', weight: 12 },
      { key: 'audioContext', weight: 10 },
      { key: 'webrtc', weight: 8 }
    ];

    checks.forEach(check => {
      maxScore += check.weight;
      if (fingerprintData[check.key]) {
        if (Array.isArray(fingerprintData[check.key])) {
          // For arrays, give partial credit based on length
          const length = fingerprintData[check.key].length;
          score += Math.min(check.weight, length * 2);
        } else {
          score += check.weight;
        }
      }
    });

    const confidence = Math.round((score / maxScore) * 100);
    
    if (confidence >= 80) return 'HIGH';
    if (confidence >= 60) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Store device fingerprint for user
   */
  static async storeDeviceFingerprint(userId, tenantId, fingerprintData, requestInfo) {
    try {
      const fingerprint = this.generateFingerprint(fingerprintData);
      
      // Create device record
      const deviceRecord = {
        fingerprint: fingerprint.fingerprint,
        confidence: fingerprint.confidence,
        components: fingerprint.components,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        loginCount: 1,
        ipAddresses: [requestInfo.ipAddress],
        locations: requestInfo.location ? [requestInfo.location] : [],
        isTrusted: false,
        isBlacklisted: false,
        riskScore: 0
      };

      // Check if device exists
      const deviceKey = `device:${tenantId}:${userId}:${fingerprint.fingerprint}`;
      const existingDevice = await CacheService.get(deviceKey, tenantId);

      if (existingDevice) {
        // Update existing device
        existingDevice.lastSeen = new Date().toISOString();
        existingDevice.loginCount += 1;
        
        // Add new IP if not already tracked
        if (!existingDevice.ipAddresses.includes(requestInfo.ipAddress)) {
          existingDevice.ipAddresses.push(requestInfo.ipAddress);
        }

        // Add location if provided and not already tracked
        if (requestInfo.location && 
            !existingDevice.locations.find(loc => 
              loc.country === requestInfo.location.country && 
              loc.city === requestInfo.location.city)) {
          existingDevice.locations.push(requestInfo.location);
        }

        await CacheService.set(deviceKey, existingDevice, 30 * 24 * 60 * 60, tenantId); // 30 days
      } else {
        // Store new device
        await CacheService.set(deviceKey, deviceRecord, 30 * 24 * 60 * 60, tenantId);
        
        // Add to user's device list
        await this.addToUserDeviceList(userId, tenantId, fingerprint.fingerprint);
      }

      await AuditService.log('DEVICE_FINGERPRINT_RECORDED', {
        action: 'record_device_fingerprint',
        userId,
        tenantId,
        fingerprint: fingerprint.fingerprint,
        confidence: fingerprint.confidence,
        isNew: !existingDevice
      }, { tenantId, userId });

      return fingerprint;

    } catch (error) {
      logger.error('Device fingerprint storage failed', { 
        error: error.message,
        userId,
        tenantId 
      });
      throw error;
    }
  }

  /**
   * Analyze device for suspicious activity
   */
  static async analyzeDeviceSuspiciousness(userId, tenantId, fingerprintData, requestInfo) {
    try {
      const fingerprint = this.generateFingerprint(fingerprintData);
      const deviceKey = `device:${tenantId}:${userId}:${fingerprint.fingerprint}`;
      const device = await CacheService.get(deviceKey, tenantId);

      const analysis = {
        fingerprint: fingerprint.fingerprint,
        isKnownDevice: !!device,
        riskLevel: 'LOW',
        riskFactors: [],
        confidence: fingerprint.confidence,
        recommendations: []
      };

      if (!device) {
        // New device
        analysis.riskLevel = 'MEDIUM';
        analysis.riskFactors.push('NEW_DEVICE');
        analysis.recommendations.push('REQUIRE_EMAIL_VERIFICATION');
        
        if (fingerprint.confidence === 'LOW') {
          analysis.riskLevel = 'HIGH';
          analysis.riskFactors.push('LOW_FINGERPRINT_CONFIDENCE');
          analysis.recommendations.push('REQUIRE_MFA');
        }
      } else {
        // Known device - check for anomalies
        
        // Check IP address changes
        if (!device.ipAddresses.includes(requestInfo.ipAddress)) {
          analysis.riskFactors.push('NEW_IP_ADDRESS');
          
          // Check for suspicious IP patterns
          if (await this.isIpSuspicious(requestInfo.ipAddress)) {
            analysis.riskLevel = 'HIGH';
            analysis.riskFactors.push('SUSPICIOUS_IP');
            analysis.recommendations.push('REQUIRE_MFA');
          }
        }

        // Check location changes
        if (requestInfo.location && device.locations.length > 0) {
          const knownLocation = device.locations.find(loc => 
            loc.country === requestInfo.location.country
          );
          
          if (!knownLocation) {
            analysis.riskFactors.push('NEW_COUNTRY');
            analysis.riskLevel = 'MEDIUM';
            analysis.recommendations.push('NOTIFY_USER');
            
            // Check for impossible travel
            if (await this.detectImpossibleTravel(device.locations, requestInfo.location, device.lastSeen)) {
              analysis.riskLevel = 'HIGH';
              analysis.riskFactors.push('IMPOSSIBLE_TRAVEL');
              analysis.recommendations.push('REQUIRE_MFA', 'SECURITY_REVIEW');
            }
          }
        }

        // Check login frequency
        if (await this.detectRapidLoginAttempts(userId, tenantId)) {
          analysis.riskLevel = 'HIGH';
          analysis.riskFactors.push('RAPID_LOGIN_ATTEMPTS');
          analysis.recommendations.push('RATE_LIMIT', 'REQUIRE_MFA');
        }
      }

      // Store analysis results
      await this.storeRiskAnalysis(userId, tenantId, analysis);

      return analysis;

    } catch (error) {
      logger.error('Device suspiciousness analysis failed', { 
        error: error.message,
        userId,
        tenantId 
      });
      throw error;
    }
  }

  /**
   * Check if IP is suspicious
   */
  static async isIpSuspicious(ipAddress) {
    try {
      // Check against known suspicious IP lists/databases
      // This could integrate with external threat intelligence APIs
      
      // Basic checks for now
      const suspiciousPatterns = [
        /^10\./, // Private networks used in attacks
        /^192\.168\./, // Local networks in unexpected contexts
      ];

      // Check if IP is in blacklist cache
      const blacklistKey = `ip_blacklist:${ipAddress}`;
      const isBlacklisted = await CacheService.get(blacklistKey, 'global');
      
      return !!isBlacklisted;

    } catch (error) {
      logger.error('IP suspiciousness check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Detect impossible travel between locations
   */
  static async detectImpossibleTravel(previousLocations, currentLocation, lastSeenTime) {
    try {
      if (!previousLocations || previousLocations.length === 0) return false;
      
      const lastLocation = previousLocations[previousLocations.length - 1];
      const timeDiff = new Date() - new Date(lastSeenTime);
      const hoursDiff = timeDiff / (1000 * 60 * 60);

      // Simple distance calculation (could be enhanced with actual geo calculations)
      const distance = this.calculateDistance(lastLocation, currentLocation);
      
      // Assume maximum travel speed of 1000 km/h (commercial flight)
      const maxPossibleDistance = hoursDiff * 1000;

      return distance > maxPossibleDistance;

    } catch (error) {
      logger.error('Impossible travel detection failed', { error: error.message });
      return false;
    }
  }

  /**
   * Calculate rough distance between two locations
   */
  static calculateDistance(loc1, loc2) {
    // Simple coordinate-based distance (replace with proper geo calculation)
    if (!loc1.lat || !loc1.lon || !loc2.lat || !loc2.lon) {
      // If no coordinates, assume different countries = 1000km
      return loc1.country !== loc2.country ? 1000 : 100;
    }
    
    // Haversine formula implementation would go here
    // For now, simple approximation
    const latDiff = Math.abs(loc1.lat - loc2.lat);
    const lonDiff = Math.abs(loc1.lon - loc2.lon);
    
    return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111; // Rough km conversion
  }

  /**
   * Detect rapid login attempts
   */
  static async detectRapidLoginAttempts(userId, tenantId) {
    try {
      const loginAttemptsKey = `login_attempts:${tenantId}:${userId}`;
      const attempts = await CacheService.get(loginAttemptsKey, tenantId) || [];
      
      // Check for more than 5 attempts in last 10 minutes
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recentAttempts = attempts.filter(attempt => 
        new Date(attempt.timestamp) > tenMinutesAgo
      );

      return recentAttempts.length > 5;

    } catch (error) {
      logger.error('Rapid login detection failed', { error: error.message });
      return false;
    }
  }

  /**
   * Store risk analysis results
   */
  static async storeRiskAnalysis(userId, tenantId, analysis) {
    try {
      const analysisKey = `risk_analysis:${tenantId}:${userId}:${Date.now()}`;
      await CacheService.set(analysisKey, {
        ...analysis,
        analyzedAt: new Date().toISOString()
      }, 7 * 24 * 60 * 60, tenantId); // 7 days

      if (analysis.riskLevel === 'HIGH') {
        await AuditService.log('HIGH_RISK_LOGIN_DETECTED', {
          action: 'high_risk_login',
          userId,
          tenantId,
          riskFactors: analysis.riskFactors,
          fingerprint: analysis.fingerprint
        }, { tenantId, userId });
      }

    } catch (error) {
      logger.error('Risk analysis storage failed', { error: error.message });
    }
  }

  /**
   * Add device to user's device list
   */
  static async addToUserDeviceList(userId, tenantId, fingerprint) {
    try {
      const userDevicesKey = `user_devices:${tenantId}:${userId}`;
      let devices = await CacheService.get(userDevicesKey, tenantId) || [];
      
      if (!devices.includes(fingerprint)) {
        devices.push(fingerprint);
        
        // Limit to 10 devices per user
        if (devices.length > 10) {
          devices = devices.slice(-10);
        }
        
        await CacheService.set(userDevicesKey, devices, 30 * 24 * 60 * 60, tenantId);
      }

    } catch (error) {
      logger.error('Device list update failed', { error: error.message });
    }
  }

  /**
   * Get user's trusted devices
   */
  static async getUserTrustedDevices(userId, tenantId) {
    try {
      const userDevicesKey = `user_devices:${tenantId}:${userId}`;
      const deviceFingerprints = await CacheService.get(userDevicesKey, tenantId) || [];
      
      const devices = [];
      for (const fingerprint of deviceFingerprints) {
        const deviceKey = `device:${tenantId}:${userId}:${fingerprint}`;
        const device = await CacheService.get(deviceKey, tenantId);
        if (device) {
          devices.push({
            fingerprint,
            isTrusted: device.isTrusted,
            lastSeen: device.lastSeen,
            loginCount: device.loginCount,
            confidence: device.confidence || 'UNKNOWN'
          });
        }
      }

      return devices;

    } catch (error) {
      logger.error('Get trusted devices failed', { error: error.message });
      return [];
    }
  }
}
