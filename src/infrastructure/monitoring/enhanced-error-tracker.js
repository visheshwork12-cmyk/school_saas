// src/infrastructure/monitoring/enhanced-error-tracker.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import crypto from "crypto";

/**
 * Enhanced Error Tracking System
 * Comprehensive error tracking with contextual information and intelligent grouping
 */
export class EnhancedErrorTracker extends EventEmitter {
  constructor() {
    super();
    this.errors = new Map();
    this.errorGroups = new Map();
    this.errorRules = new Map();
    this.alerts = new Map();
    this.contextProviders = new Map();
    this.initializeErrorRules();
    this.setupGlobalErrorHandlers();
  }

  /**
   * Initialize error rules and classifications
   */
  initializeErrorRules() {
    // Database Error Rules
    this.addErrorRule('DATABASE_ERROR', {
      name: 'Database Errors',
      patterns: [
        /connection.*timeout/i,
        /database.*not.*found/i,
        /duplicate.*key/i,
        /foreign.*key.*constraint/i,
        /syntax.*error.*sql/i
      ],
      severity: 'HIGH',
      category: 'DATABASE',
      autoRetry: true,
      maxRetries: 3
    });

    // Authentication Error Rules
    this.addErrorRule('AUTH_ERROR', {
      name: 'Authentication Errors',
      patterns: [
        /unauthorized/i,
        /forbidden/i,
        /invalid.*token/i,
        /session.*expired/i,
        /authentication.*failed/i
      ],
      severity: 'MEDIUM',
      category: 'SECURITY',
      autoRetry: false,
      alertThreshold: 10
    });

    // Validation Error Rules
    this.addErrorRule('VALIDATION_ERROR', {
      name: 'Validation Errors',
      patterns: [
        /validation.*failed/i,
        /invalid.*input/i,
        /required.*field/i,
        /schema.*violation/i
      ],
      severity: 'LOW',
      category: 'VALIDATION',
      autoRetry: false,
      userFacing: true
    });

    // Performance Error Rules
    this.addErrorRule('PERFORMANCE_ERROR', {
      name: 'Performance Errors',
      patterns: [
        /timeout/i,
        /too.*slow/i,
        /memory.*limit/i,
        /cpu.*limit/i,
        /request.*timeout/i
      ],
      severity: 'HIGH',
      category: 'PERFORMANCE',
      autoRetry: true,
      maxRetries: 2
    });

    // External Service Error Rules
    this.addErrorRule('EXTERNAL_SERVICE_ERROR', {
      name: 'External Service Errors',
      patterns: [
        /service.*unavailable/i,
        /network.*error/i,
        /connection.*refused/i,
        /dns.*resolution/i,
        /api.*error/i
      ],
      severity: 'MEDIUM',
      category: 'EXTERNAL',
      autoRetry: true,
      maxRetries: 5
    });
  }

  /**
   * Setup global error handlers
   */
  setupGlobalErrorHandlers() {
    // Uncaught Exception Handler
    process.on('uncaughtException', (error) => {
      this.trackError(error, {
        type: 'uncaught_exception',
        severity: 'CRITICAL',
        fatal: true
      });
    });

    // Unhandled Promise Rejection Handler
    process.on('unhandledRejection', (reason, promise) => {
      this.trackError(reason, {
        type: 'unhandled_rejection',
        severity: 'HIGH',
        promise: promise.toString()
      });
    });

    // Warning Handler
    process.on('warning', (warning) => {
      this.trackError(warning, {
        type: 'warning',
        severity: 'LOW'
      });
    });
  }

  /**
   * Track error with enhanced context
   */
  async trackError(error, context = {}) {
    try {
      const errorData = this.processError(error, context);
      const errorGroup = await this.groupError(errorData);
      
      // Store error
      this.errors.set(errorData.id, errorData);
      
      // Update error group
      this.updateErrorGroup(errorGroup, errorData);
      
      // Check alert thresholds
      await this.checkAlertThresholds(errorGroup, errorData);
      
      // Emit error event
      this.emit('errorTracked', errorData);
      
      logger.error('Error tracked:', {
        id: errorData.id,
        groupId: errorGroup.id,
        message: errorData.message,
        severity: errorData.severity
      });

      return errorData;

    } catch (trackingError) {
      logger.error('Failed to track error:', trackingError);
      // Don't throw to avoid infinite error loops
    }
  }

  /**
   * Process and enrich error data
   */
  async processError(error, context = {}) {
    const now = new Date();
    const errorId = this.generateErrorId(error, context);
    
    const errorData = {
      id: errorId,
      timestamp: now,
      message: error.message || error.toString(),
      name: error.name || 'Error',
      stack: error.stack,
      type: context.type || 'application_error',
      severity: context.severity || this.determineSeverity(error),
      category: context.category || this.categorizeError(error),
      
      // Context information
      context: {
        ...context,
        user: context.userId || 'anonymous',
        tenant: context.tenantId || null,
        request: context.request ? this.sanitizeRequest(context.request) : null,
        session: context.sessionId || null,
        component: context.component || this.extractComponent(error.stack),
        environment: process.env.NODE_ENV || 'development'
      },
      
      // Technical details
      technical: {
        pid: process.pid,
        platform: process.platform,
        nodeVersion: process.version,
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: now.toISOString()
      },
      
      // Error fingerprint for grouping
      fingerprint: this.generateFingerprint(error),
      
      // Metadata
      metadata: {
        count: 1,
        firstSeen: now,
        lastSeen: now,
        resolved: false,
        tags: context.tags || []
      }
    };

    // Add breadcrumbs if available
    if (context.breadcrumbs) {
      errorData.breadcrumbs = context.breadcrumbs.slice(-10); // Last 10 breadcrumbs
    }

    // Add custom context from providers
    for (const [providerId, provider] of this.contextProviders) {
      try {
        const customContext = await provider(error, context);
        if (customContext) {
          errorData.context[providerId] = customContext;
        }
      } catch (providerError) {
        logger.warn(`Context provider ${providerId} failed:`, providerError.message);
      }
    }

    return errorData;
  }

  /**
   * Group similar errors together
   */
  async groupError(errorData) {
    const fingerprint = errorData.fingerprint;
    
    if (this.errorGroups.has(fingerprint)) {
      return this.errorGroups.get(fingerprint);
    }

    // Create new error group
    const errorGroup = {
      id: fingerprint,
      title: this.generateGroupTitle(errorData),
      fingerprint,
      category: errorData.category,
      severity: errorData.severity,
      
      // Statistics
      stats: {
        count: 0,
        users: new Set(),
        tenants: new Set(),
        firstSeen: errorData.timestamp,
        lastSeen: errorData.timestamp,
        frequency: 0
      },
      
      // Sample error
      sample: {
        message: errorData.message,
        stack: errorData.stack,
        context: errorData.context
      },
      
      // Resolution info
      resolution: {
        status: 'OPEN',
        assignee: null,
        resolvedAt: null,
        notes: []
      },
      
      // Related information
      related: {
        similarGroups: [],
        affectedComponents: new Set(),
        commonPatterns: []
      }
    };

    this.errorGroups.set(fingerprint, errorGroup);
    return errorGroup;
  }

  /**
   * Update error group with new error data
   */
  updateErrorGroup(errorGroup, errorData) {
    errorGroup.stats.count++;
    errorGroup.stats.lastSeen = errorData.timestamp;
    
    if (errorData.context.user && errorData.context.user !== 'anonymous') {
      errorGroup.stats.users.add(errorData.context.user);
    }
    
    if (errorData.context.tenant) {
      errorGroup.stats.tenants.add(errorData.context.tenant);
    }

    // Update frequency calculation
    const timeDiff = errorData.timestamp - errorGroup.stats.firstSeen;
    const hoursElapsed = timeDiff / (1000 * 60 * 60);
    errorGroup.stats.frequency = hoursElapsed > 0 ? errorGroup.stats.count / hoursElapsed : 0;

    // Update severity if current error is more severe
    const severityLevels = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    if (severityLevels[errorData.severity] > severityLevels[errorGroup.severity]) {
      errorGroup.severity = errorData.severity;
    }

    // Track affected components
    if (errorData.context.component) {
      errorGroup.related.affectedComponents.add(errorData.context.component);
    }
  }

  /**
   * Analyze error trends and patterns
   */
  async analyzeErrorTrends(timeRange = '24h') {
    try {
      const analysis = {
        timeRange,
        generatedAt: new Date(),
        summary: {
          totalErrors: 0,
          totalGroups: 0,
          newGroups: 0,
          resolvedGroups: 0,
          criticalErrors: 0,
          trendDirection: 'stable'
        },
        trends: {
          byHour: {},
          byCategory: {},
          bySeverity: {},
          byComponent: {}
        },
        topErrors: [],
        patterns: [],
        recommendations: []
      };

      const cutoff = Date.now() - this.parseTimeRange(timeRange);
      const recentErrors = Array.from(this.errors.values()).filter(
        error => error.timestamp.getTime() > cutoff
      );

      // Calculate summary
      analysis.summary.totalErrors = recentErrors.length;
      analysis.summary.totalGroups = this.errorGroups.size;
      analysis.summary.criticalErrors = recentErrors.filter(e => e.severity === 'CRITICAL').length;

      // Analyze trends by hour
      const hourlyBuckets = {};
      recentErrors.forEach(error => {
        const hour = new Date(error.timestamp).getHours();
        hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
      });
      analysis.trends.byHour = hourlyBuckets;

      // Analyze by category
      const categoryBuckets = {};
      recentErrors.forEach(error => {
        categoryBuckets[error.category] = (categoryBuckets[error.category] || 0) + 1;
      });
      analysis.trends.byCategory = categoryBuckets;

      // Analyze by severity
      const severityBuckets = {};
      recentErrors.forEach(error => {
        severityBuckets[error.severity] = (severityBuckets[error.severity] || 0) + 1;
      });
      analysis.trends.bySeverity = severityBuckets;

      // Top error groups
      analysis.topErrors = Array.from(this.errorGroups.values())
        .sort((a, b) => b.stats.count - a.stats.count)
        .slice(0, 10)
        .map(group => ({
          id: group.id,
          title: group.title,
          count: group.stats.count,
          severity: group.severity,
          category: group.category,
          frequency: group.stats.frequency,
          affectedUsers: group.stats.users.size,
          lastSeen: group.stats.lastSeen
        }));

      // Pattern analysis
      analysis.patterns = await this.identifyErrorPatterns(recentErrors);

      // Generate recommendations
      analysis.recommendations = this.generateErrorRecommendations(analysis);

      return analysis;

    } catch (error) {
      logger.error('Failed to analyze error trends:', error);
      throw error;
    }
  }

  /**
   * Identify error patterns
   */
  async identifyErrorPatterns(errors) {
    const patterns = [];

    // Spike detection
    const hourlyBuckets = {};
    errors.forEach(error => {
      const hour = new Date(error.timestamp).getHours();
      hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;
    });

    const avgErrorsPerHour = Object.values(hourlyBuckets).reduce((sum, count) => sum + count, 0) / 24;
    const spikes = Object.entries(hourlyBuckets).filter(([hour, count]) => count > avgErrorsPerHour * 2);

    if (spikes.length > 0) {
      patterns.push({
        type: 'ERROR_SPIKE',
        description: `Error spikes detected during hours: ${spikes.map(([hour]) => hour).join(', ')}`,
        severity: 'HIGH',
        recommendation: 'Investigate system load or deployment timing'
      });
    }

    // Cascading failures
    const cascadingErrors = errors.filter(error => 
      error.category === 'DATABASE' || error.category === 'EXTERNAL'
    ).length;

    if (cascadingErrors > errors.length * 0.3) {
      patterns.push({
        type: 'CASCADING_FAILURE',
        description: 'High percentage of infrastructure-related errors detected',
        severity: 'CRITICAL',
        recommendation: 'Check database and external service health'
      });
    }

    return patterns;
  }

  /**
   * Check alert thresholds and send notifications
   */
  async checkAlertThresholds(errorGroup, errorData) {
    const rule = this.findMatchingRule(errorData);
    
    if (rule && rule.alertThreshold) {
      if (errorGroup.stats.count >= rule.alertThreshold) {
        await this.triggerAlert(errorGroup, errorData, rule);
      }
    }

    // Check for critical errors
    if (errorData.severity === 'CRITICAL') {
      await this.triggerImmediateAlert(errorGroup, errorData);
    }

    // Check for error frequency spikes
    if (errorGroup.stats.frequency > 10) { // More than 10 errors per hour
      await this.triggerFrequencyAlert(errorGroup, errorData);
    }
  }

  /**
   * Trigger alert for error group
   */
  async triggerAlert(errorGroup, errorData, rule) {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`,
      type: 'ERROR_THRESHOLD',
      errorGroupId: errorGroup.id,
      rule: rule.name,
      threshold: rule.alertThreshold,
      currentCount: errorGroup.stats.count,
      severity: errorData.severity,
      message: `Error group "${errorGroup.title}" has exceeded threshold (${errorGroup.stats.count} occurrences)`,
      timestamp: new Date(),
      status: 'ACTIVE'
    };

    this.alerts.set(alert.id, alert);
    this.emit('alert', alert);

    logger.warn('Error alert triggered:', alert);
  }

  // Helper methods
  addErrorRule(ruleId, rule) {
    this.errorRules.set(ruleId, rule);
  }

  addContextProvider(providerId, provider) {
    this.contextProviders.set(providerId, provider);
  }

  generateErrorId(error, context) {
    const data = `${error.message}${error.stack}${JSON.stringify(context)}${Date.now()}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  generateFingerprint(error) {
    // Create fingerprint based on error message and stack trace structure
    const stackLines = (error.stack || '').split('\n').slice(0, 5); // First 5 lines
    const normalizedStack = stackLines.map(line => 
      line.replace(/:\d+:\d+/g, ':X:X') // Replace line numbers
          .replace(/\/[^/]+\//g, '/.../')  // Replace paths
    ).join('|');
    
    const fingerprintData = `${error.name}|${error.message}|${normalizedStack}`;
    return crypto.createHash('md5').update(fingerprintData).digest('hex');
  }

  generateGroupTitle(errorData) {
    const message = errorData.message.length > 100 
      ? errorData.message.substring(0, 100) + '...'
      : errorData.message;
    return `${errorData.name}: ${message}`;
  }

  determineSeverity(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('critical') || message.includes('fatal') || message.includes('crash')) {
      return 'CRITICAL';
    }
    if (message.includes('error') || message.includes('failed') || message.includes('timeout')) {
      return 'HIGH';
    }
    if (message.includes('warning') || message.includes('deprecated')) {
      return 'MEDIUM';
    }
    return 'LOW';
  }

  categorizeError(error) {
    const rule = this.findMatchingRule(error);
    return rule ? rule.category : 'GENERAL';
  }

  findMatchingRule(error) {
    const message = error.message || error.toString();
    
    for (const [ruleId, rule] of this.errorRules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(message)) {
          return rule;
        }
      }
    }
    
    return null;
  }

  extractComponent(stack) {
    if (!stack) return 'unknown';
    
    const lines = stack.split('\n');
    for (const line of lines) {
      const match = line.match(/at\s+.*?([^/\\]+)\.js/);
      if (match) {
        return match[1];
      }
    }
    
    return 'unknown';
  }

  sanitizeRequest(request) {
    return {
      method: request.method,
      url: request.url,
      headers: this.sanitizeHeaders(request.headers),
      query: request.query,
      userAgent: request.get ? request.get('User-Agent') : undefined
    };
  }

  sanitizeHeaders(headers) {
    const sanitized = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    
    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }

  parseTimeRange(timeRange) {
    const units = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const match = timeRange.match(/^(\d+)([smhd])$/);
    return match ? parseInt(match[1]) * units[match[2]] : 86400000; // Default 24h
  }

  generateErrorRecommendations(analysis) {
    const recommendations = [];

    // High error rate recommendation
    if (analysis.summary.totalErrors > 100) {
      recommendations.push({
        type: 'HIGH_ERROR_RATE',
        priority: 'HIGH',
        message: `High error rate detected: ${analysis.summary.totalErrors} errors in ${analysis.timeRange}`,
        suggestion: 'Review recent deployments and system health'
      });
    }

    // Critical errors recommendation
    if (analysis.summary.criticalErrors > 0) {
      recommendations.push({
        type: 'CRITICAL_ERRORS',
        priority: 'CRITICAL',
        message: `${analysis.summary.criticalErrors} critical errors need immediate attention`,
        suggestion: 'Address critical errors immediately to prevent system instability'
      });
    }

    return recommendations;
  }

  async triggerImmediateAlert(errorGroup, errorData) {
    const alert = {
      id: `critical_alert_${Date.now()}`,
      type: 'CRITICAL_ERROR',
      errorGroupId: errorGroup.id,
      severity: 'CRITICAL',
      message: `Critical error detected: ${errorData.message}`,
      timestamp: new Date(),
      status: 'ACTIVE',
      immediate: true
    };

    this.alerts.set(alert.id, alert);
    this.emit('criticalAlert', alert);
  }

  async triggerFrequencyAlert(errorGroup, errorData) {
    const alert = {
      id: `frequency_alert_${Date.now()}`,
      type: 'HIGH_FREQUENCY',
      errorGroupId: errorGroup.id,
      frequency: errorGroup.stats.frequency,
      message: `High frequency errors: ${errorGroup.stats.frequency.toFixed(1)} errors/hour`,
      timestamp: new Date(),
      status: 'ACTIVE'
    };

    this.alerts.set(alert.id, alert);
    this.emit('frequencyAlert', alert);
  }

  // Public getters
  getErrorSummary(timeRange = '24h') {
    const cutoff = Date.now() - this.parseTimeRange(timeRange);
    const recentErrors = Array.from(this.errors.values()).filter(
      error => error.timestamp.getTime() > cutoff
    );

    return {
      totalErrors: recentErrors.length,
      totalGroups: this.errorGroups.size,
      activeAlerts: Array.from(this.alerts.values()).filter(a => a.status === 'ACTIVE').length,
      bySeverity: {
        critical: recentErrors.filter(e => e.severity === 'CRITICAL').length,
        high: recentErrors.filter(e => e.severity === 'HIGH').length,
        medium: recentErrors.filter(e => e.severity === 'MEDIUM').length,
        low: recentErrors.filter(e => e.severity === 'LOW').length
      }
    };
  }
}

// Export singleton instance
export const enhancedErrorTracker = new EnhancedErrorTracker();
