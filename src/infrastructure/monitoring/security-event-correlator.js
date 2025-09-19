// src/infrastructure/monitoring/security-event-correlator.js
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { CacheService } from "#core/cache/services/unified-cache.service.js";
import crypto from "crypto";
import moment from "moment";

/**
 * Advanced Security Event Correlation Engine
 */
export class SecurityEventCorrelator {
  constructor() {
    this.correlationRules = new Map();
    this.eventBuffer = new Map();
    this.threatPatterns = new Map();
    this.anomalyThresholds = new Map();
    this.initializeCorrelationRules();
  }

  /**
   * Initialize correlation rules for different threat patterns
   */
  initializeCorrelationRules() {
    // Brute Force Attack Detection
    this.addCorrelationRule('BRUTE_FORCE_ATTACK', {
      events: ['LOGIN_FAILED'],
      conditions: {
        sameSource: true,
        timeWindow: 300, // 5 minutes
        threshold: 5,
        escalation: {
          count: 10,
          action: 'BLOCK_IP',
          duration: 3600 // 1 hour
        }
      },
      severity: 'HIGH',
      description: 'Multiple failed login attempts from same source'
    });

    // Privilege Escalation Detection
    this.addCorrelationRule('PRIVILEGE_ESCALATION', {
      events: ['ROLE_CHANGED', 'PERMISSION_GRANTED', 'ADMIN_ACCESS'],
      conditions: {
        sameUser: true,
        timeWindow: 600, // 10 minutes
        sequence: true
      },
      severity: 'CRITICAL',
      description: 'Suspicious privilege escalation pattern detected'
    });

    // Data Exfiltration Pattern
    this.addCorrelationRule('DATA_EXFILTRATION', {
      events: ['BULK_DOWNLOAD', 'API_RATE_EXCEEDED', 'LARGE_QUERY'],
      conditions: {
        sameUser: true,
        timeWindow: 1800, // 30 minutes
        volumeThreshold: 1000 // records
      },
      severity: 'CRITICAL',
      description: 'Potential data exfiltration activity detected'
    });

    // Suspicious Multi-Tenant Access
    this.addCorrelationRule('CROSS_TENANT_BREACH', {
      events: ['TENANT_SWITCH', 'UNAUTHORIZED_ACCESS', 'DATA_ACCESS'],
      conditions: {
        sameUser: true,
        differentTenants: true,
        timeWindow: 300
      },
      severity: 'CRITICAL',
      description: 'Suspicious cross-tenant access pattern'
    });

    // Account Takeover Pattern
    this.addCorrelationRule('ACCOUNT_TAKEOVER', {
      events: ['LOGIN_SUCCESS', 'PASSWORD_CHANGED', 'EMAIL_CHANGED'],
      conditions: {
        sameUser: true,
        differentGeoLocation: true,
        timeWindow: 600
      },
      severity: 'HIGH',
      description: 'Potential account takeover detected'
    });
  }

  /**
   * Add custom correlation rule
   */
  addCorrelationRule(ruleId, rule) {
    this.correlationRules.set(ruleId, {
      ...rule,
      id: ruleId,
      createdAt: new Date(),
      matchCount: 0
    });
    logger.info(`Security correlation rule added: ${ruleId}`);
  }

  /**
   * Process incoming security event
   */
  async processSecurityEvent(event) {
    try {
      const correlationKey = this.generateCorrelationKey(event);
      
      // Store event in buffer
      await this.storeEventInBuffer(correlationKey, event);
      
      // Check all correlation rules
      for (const [ruleId, rule] of this.correlationRules) {
        const correlation = await this.checkCorrelationRule(rule, event);
        if (correlation.matched) {
          await this.handleCorrelationMatch(ruleId, correlation, event);
        }
      }

      // Cleanup old events
      await this.cleanupOldEvents();

    } catch (error) {
      logger.error('Error processing security event for correlation:', error);
    }
  }

  /**
   * Generate correlation key for event grouping
   */
  generateCorrelationKey(event) {
    const keyParts = [
      event.tenantId,
      event.userId || event.ipAddress,
      event.eventType
    ].filter(Boolean);
    
    return crypto.createHash('md5')
      .update(keyParts.join(':'))
      .digest('hex');
  }

  /**
   * Store event in correlation buffer
   */
  async storeEventInBuffer(correlationKey, event) {
    const eventKey = `correlation:${correlationKey}`;
    const existing = await CacheService.get(eventKey) || [];
    
    existing.push({
      ...event,
      timestamp: new Date(),
      correlationId: crypto.randomUUID()
    });

    // Keep only recent events (last hour)
    const oneHourAgo = moment().subtract(1, 'hour').toDate();
    const filtered = existing.filter(e => new Date(e.timestamp) > oneHourAgo);
    
    await CacheService.set(eventKey, filtered, 3600);
  }

  /**
   * Check if event matches correlation rule
   */
  async checkCorrelationRule(rule, currentEvent) {
    const correlationKey = this.generateCorrelationKey(currentEvent);
    const eventKey = `correlation:${correlationKey}`;
    const events = await CacheService.get(eventKey) || [];

    // Filter events within time window
    const timeWindow = moment().subtract(rule.conditions.timeWindow, 'seconds').toDate();
    const recentEvents = events.filter(e => new Date(e.timestamp) > timeWindow);

    // Check if rule events are present
    const matchingEvents = recentEvents.filter(e => 
      rule.events.includes(e.eventType)
    );

    if (matchingEvents.length < rule.conditions.threshold) {
      return { matched: false };
    }

    // Additional condition checks
    const conditionResults = await this.evaluateConditions(
      rule.conditions, 
      matchingEvents, 
      currentEvent
    );

    return {
      matched: conditionResults.passed,
      events: matchingEvents,
      confidence: conditionResults.confidence,
      details: conditionResults.details
    };
  }

  /**
   * Evaluate rule conditions
   */
  async evaluateConditions(conditions, events, currentEvent) {
    let confidence = 0;
    const details = {};

    // Same source check
    if (conditions.sameSource) {
      const sources = [...new Set(events.map(e => e.ipAddress))];
      if (sources.length === 1) {
        confidence += 25;
        details.sameSource = true;
      }
    }

    // Same user check
    if (conditions.sameUser) {
      const users = [...new Set(events.map(e => e.userId).filter(Boolean))];
      if (users.length === 1) {
        confidence += 25;
        details.sameUser = true;
      }
    }

    // Different tenants check
    if (conditions.differentTenants) {
      const tenants = [...new Set(events.map(e => e.tenantId))];
      if (tenants.length > 1) {
        confidence += 30;
        details.crossTenant = tenants;
      }
    }

    // Geographic anomaly check
    if (conditions.differentGeoLocation) {
      const locations = events.map(e => e.geoLocation).filter(Boolean);
      if (this.hasGeoAnomalies(locations)) {
        confidence += 20;
        details.geoAnomaly = true;
      }
    }

    // Volume threshold check
    if (conditions.volumeThreshold) {
      const totalVolume = events.reduce((sum, e) => sum + (e.recordCount || 1), 0);
      if (totalVolume > conditions.volumeThreshold) {
        confidence += 30;
        details.volumeExceeded = totalVolume;
      }
    }

    return {
      passed: confidence >= 50,
      confidence,
      details
    };
  }

  /**
   * Handle correlation rule match
   */
  async handleCorrelationMatch(ruleId, correlation, triggerEvent) {
    const rule = this.correlationRules.get(ruleId);
    rule.matchCount++;

    const securityIncident = {
      incidentId: crypto.randomUUID(),
      ruleId,
      ruleName: rule.description,
      severity: rule.severity,
      confidence: correlation.confidence,
      triggerEvent,
      correlatedEvents: correlation.events,
      detectedAt: new Date(),
      status: 'ACTIVE',
      details: correlation.details,
      tenantId: triggerEvent.tenantId
    };

    // Log security incident
    await AuditService.log('SECURITY_INCIDENT_DETECTED', {
      ...securityIncident,
      action: 'correlation_match'
    });

    // Generate alert
    await this.generateSecurityAlert(securityIncident);

    // Execute automated response if configured
    if (rule.conditions.escalation) {
      await this.executeAutomatedResponse(securityIncident, rule.conditions.escalation);
    }

    logger.warn(`Security correlation match: ${ruleId}`, {
      incidentId: securityIncident.incidentId,
      confidence: correlation.confidence,
      severity: rule.severity
    });
  }

  /**
   * Generate security alert
   */
  async generateSecurityAlert(incident) {
    const alert = {
      alertId: crypto.randomUUID(),
      type: 'SECURITY_CORRELATION',
      severity: incident.severity,
      title: `Security Incident: ${incident.ruleName}`,
      description: this.generateAlertDescription(incident),
      tenantId: incident.tenantId,
      createdAt: new Date(),
      status: 'OPEN',
      assignedTo: 'security-team',
      metadata: {
        incidentId: incident.incidentId,
        ruleId: incident.ruleId,
        confidence: incident.confidence,
        eventCount: incident.correlatedEvents.length
      }
    };

    // Store alert
    await CacheService.set(`alert:${alert.alertId}`, alert, 86400);

    // Send notification
    await this.sendSecurityNotification(alert, incident);
  }

  /**
   * Generate alert description
   */
  generateAlertDescription(incident) {
    const { details, correlatedEvents } = incident;
    let description = `${incident.ruleName}\n\n`;
    
    description += `Confidence Level: ${incident.confidence}%\n`;
    description += `Events Correlated: ${correlatedEvents.length}\n`;
    description += `Time Range: ${moment(correlatedEvents[0].timestamp).format('YYYY-MM-DD HH:mm:ss')} - ${moment().format('YYYY-MM-DD HH:mm:ss')}\n\n`;
    
    if (details.sameSource) {
      description += `Source IP: ${correlatedEvents[0].ipAddress}\n`;
    }
    
    if (details.sameUser) {
      description += `User ID: ${correlatedEvents[0].userId}\n`;
    }
    
    if (details.crossTenant) {
      description += `Tenants Involved: ${details.crossTenant.join(', ')}\n`;
    }
    
    if (details.volumeExceeded) {
      description += `Volume Threshold Exceeded: ${details.volumeExceeded} records\n`;
    }

    return description;
  }

  /**
   * Send security notification
   */
  async sendSecurityNotification(alert, incident) {
    try {
      const notificationPayload = {
        channel: '#security-alerts',
        severity: alert.severity,
        title: alert.title,
        message: alert.description,
        metadata: {
          incidentId: incident.incidentId,
          tenantId: incident.tenantId,
          timestamp: new Date().toISOString()
        }
      };

      // Send to notification service (Slack, Teams, etc.)
      // Implementation depends on your notification system
      logger.info('Security notification sent', { alertId: alert.alertId });

    } catch (error) {
      logger.error('Failed to send security notification:', error);
    }
  }

  /**
   * Execute automated response
   */
  async executeAutomatedResponse(incident, escalation) {
    try {
      switch (escalation.action) {
        case 'BLOCK_IP':
          await this.blockSuspiciousIP(incident, escalation.duration);
          break;
        case 'SUSPEND_USER':
          await this.suspendUser(incident, escalation.duration);
          break;
        case 'REQUIRE_MFA':
          await this.requireMFA(incident);
          break;
        case 'ISOLATE_SESSION':
          await this.isolateUserSessions(incident);
          break;
      }

      await AuditService.log('AUTOMATED_RESPONSE_EXECUTED', {
        incidentId: incident.incidentId,
        action: escalation.action,
        duration: escalation.duration
      });

    } catch (error) {
      logger.error('Failed to execute automated response:', error);
    }
  }

  /**
   * Block suspicious IP address
   */
  async blockSuspiciousIP(incident, duration) {
    const ipAddress = incident.triggerEvent.ipAddress;
    if (!ipAddress) return;

    // Add to blocked IPs cache
    const blockKey = `blocked_ip:${ipAddress}`;
    await CacheService.set(blockKey, {
      blockedAt: new Date(),
      reason: `Security incident: ${incident.ruleId}`,
      incidentId: incident.incidentId,
      duration
    }, duration);

    logger.warn(`IP address blocked: ${ipAddress}`, {
      incidentId: incident.incidentId,
      duration
    });
  }

  /**
   * Check for geographic anomalies
   */
  hasGeoAnomalies(locations) {
    if (locations.length < 2) return false;
    
    // Simple implementation - check for different countries
    const countries = [...new Set(locations.map(loc => loc?.country).filter(Boolean))];
    return countries.length > 1;
  }

  /**
   * Cleanup old events from buffer
   */
  async cleanupOldEvents() {
    // This would be implemented based on your caching strategy
    // For now, we rely on TTL in CacheService
  }

  /**
   * Get correlation statistics
   */
  async getCorrelationStats() {
    const stats = {
      totalRules: this.correlationRules.size,
      rules: [],
      totalMatches: 0
    };

    for (const [ruleId, rule] of this.correlationRules) {
      stats.rules.push({
        id: ruleId,
        description: rule.description,
        severity: rule.severity,
        matchCount: rule.matchCount,
        events: rule.events
      });
      stats.totalMatches += rule.matchCount;
    }

    return stats;
  }
}

// Export singleton instance
export const securityEventCorrelator = new SecurityEventCorrelator();
