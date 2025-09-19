// src/infrastructure/monitoring/real-time-threat-detector.js
import { logger } from "#utils/core/logger.js";
import { CacheService } from "#core/cache/services/unified-cache.service.js";
import { securityEventCorrelator } from "./security-event-correlator.js";
import crypto from "crypto";
import moment from "moment";

/**
 * Real-time ML-powered Threat Detection Engine
 */
export class RealTimeThreatDetector {
  constructor() {
    this.behaviorBaselines = new Map();
    this.anomalyThresholds = new Map();
    this.threatModels = new Map();
    this.activeThreats = new Map();
    this.initializeThreatModels();
  }

  /**
   * Initialize ML-based threat detection models
   */
  initializeThreatModels() {
    // User Behavior Analytics (UBA) model
    this.addThreatModel('UBA_ANOMALY', {
      type: 'behavioral',
      features: [
        'login_frequency',
        'api_usage_pattern',
        'geo_location',
        'device_fingerprint',
        'time_of_access',
        'data_access_volume'
      ],
      anomalyThreshold: 0.7,
      learningWindow: 30, // days
      description: 'Detects anomalous user behavior patterns'
    });

    // Network Traffic Analysis model
    this.addThreatModel('NETWORK_ANOMALY', {
      type: 'network',
      features: [
        'request_rate',
        'payload_size',
        'response_time',
        'error_rate',
        'endpoint_diversity'
      ],
      anomalyThreshold: 0.8,
      learningWindow: 7, // days
      description: 'Detects suspicious network traffic patterns'
    });

    // Data Access Pattern Analysis
    this.addThreatModel('DATA_ACCESS_ANOMALY', {
      type: 'data_access',
      features: [
        'query_complexity',
        'data_volume',
        'access_time',
        'cross_tenant_access',
        'bulk_operations'
      ],
      anomalyThreshold: 0.75,
      learningWindow: 14, // days
      description: 'Detects unusual data access patterns'
    });

    // Authentication Pattern Analysis
    this.addThreatModel('AUTH_ANOMALY', {
      type: 'authentication',
      features: [
        'login_frequency',
        'failed_attempts',
        'multi_location_access',
        'device_changes',
        'time_deviation'
      ],
      anomalyThreshold: 0.6,
      learningWindow: 7, // days
      description: 'Detects suspicious authentication patterns'
    });
  }

  /**
   * Add threat detection model
   */
  addThreatModel(modelId, model) {
    this.threatModels.set(modelId, {
      ...model,
      id: modelId,
      createdAt: new Date(),
      detectionCount: 0,
      lastUpdate: new Date()
    });
  }

  /**
   * Analyze incoming request for threats in real-time
   */
  async analyzeRequest(req, res, requestData) {
    try {
      const analysisContext = this.buildAnalysisContext(req, requestData);
      const threats = [];

      // Run all threat models
      for (const [modelId, model] of this.threatModels) {
        const threatScore = await this.runThreatModel(model, analysisContext);
        
        if (threatScore.isAnomalous) {
          threats.push({
            modelId,
            threatType: model.type,
            score: threatScore.score,
            confidence: threatScore.confidence,
            features: threatScore.features,
            description: model.description,
            severity: this.calculateThreatSeverity(threatScore.score, model.type)
          });
        }
      }

      // If threats detected, process them
      if (threats.length > 0) {
        await this.processThreatDetection(analysisContext, threats);
      }

      // Update user behavior baseline (async)
      setImmediate(() => this.updateBehaviorBaseline(analysisContext));

      return {
        threatsDetected: threats.length > 0,
        threats,
        riskScore: this.calculateOverallRiskScore(threats)
      };

    } catch (error) {
      logger.error('Threat analysis failed:', error);
      return { threatsDetected: false, threats: [], riskScore: 0 };
    }
  }

  /**
   * Build analysis context from request data
   */
  buildAnalysisContext(req, requestData = {}) {
    return {
      // Request metadata
      requestId: req.requestId,
      timestamp: new Date(),
      
      // User context
      userId: req.user?.id,
      tenantId: req.context?.tenantId,
      userRole: req.user?.role,
      
      // Network context
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      geoLocation: req.geoLocation,
      
      // Request context
      method: req.method,
      path: req.path,
      query: req.query,
      headers: this.sanitizeHeaders(req.headers),
      
      // Timing context
      timeOfDay: moment().format('HH:mm'),
      dayOfWeek: moment().format('dddd'),
      
      // Behavioral context
      sessionDuration: requestData.sessionDuration,
      requestsInSession: requestData.requestsInSession,
      dataVolume: requestData.dataVolume || 0,
      
      // Security context
      authMethod: requestData.authMethod,
      deviceFingerprint: this.generateDeviceFingerprint(req),
      
      // Feature vector for ML models
      features: this.extractFeatures(req, requestData)
    };
  }

  /**
   * Extract features for ML analysis
   */
  extractFeatures(req, requestData = {}) {
    const features = {};

    // Time-based features
    const now = moment();
    features.hour_of_day = now.hour();
    features.day_of_week = now.day();
    features.is_weekend = now.day() === 0 || now.day() === 6 ? 1 : 0;

    // Request features
    features.method_get = req.method === 'GET' ? 1 : 0;
    features.method_post = req.method === 'POST' ? 1 : 0;
    features.method_put = req.method === 'PUT' ? 1 : 0;
    features.method_delete = req.method === 'DELETE' ? 1 : 0;

    // Path features
    features.is_admin_path = req.path.includes('/admin') ? 1 : 0;
    features.is_auth_path = req.path.includes('/auth') ? 1 : 0;
    features.is_api_path = req.path.includes('/api') ? 1 : 0;

    // Query complexity
    features.query_param_count = Object.keys(req.query || {}).length;
    features.has_complex_query = this.hasComplexQuery(req.query) ? 1 : 0;

    // Request size
    const contentLength = req.get('content-length');
    features.request_size = contentLength ? parseInt(contentLength) : 0;
    features.large_request = features.request_size > 1024 * 1024 ? 1 : 0; // > 1MB

    // User agent features
    const userAgent = req.get('User-Agent') || '';
    features.is_mobile = /mobile/i.test(userAgent) ? 1 : 0;
    features.is_bot = /bot|crawler|spider/i.test(userAgent) ? 1 : 0;

    // Session features
    features.session_duration = requestData.sessionDuration || 0;
    features.requests_in_session = requestData.requestsInSession || 1;

    return features;
  }

  /**
   * Run specific threat detection model
   */
  async runThreatModel(model, context) {
    try {
      switch (model.type) {
        case 'behavioral':
          return await this.runUBAModel(model, context);
        case 'network':
          return await this.runNetworkAnomalyModel(model, context);
        case 'data_access':
          return await this.runDataAccessModel(model, context);
        case 'authentication':
          return await this.runAuthenticationModel(model, context);
        default:
          return { isAnomalous: false, score: 0, confidence: 0 };
      }
    } catch (error) {
      logger.error(`Threat model ${model.id} execution failed:`, error);
      return { isAnomalous: false, score: 0, confidence: 0 };
    }
  }

  /**
   * Run User Behavior Analytics model
   */
  async runUBAModel(model, context) {
    const baseline = await this.getUserBaseline(context.userId);
    if (!baseline) {
      return { isAnomalous: false, score: 0, confidence: 0 };
    }

    let anomalyScore = 0;
    const features = {};

    // Time-based anomaly detection
    const currentHour = moment().hour();
    const typicalHours = baseline.typical_hours || [];
    const hourAnomaly = typicalHours.includes(currentHour) ? 0 : 0.3;
    features.time_anomaly = hourAnomaly;
    anomalyScore += hourAnomaly;

    // Location-based anomaly detection
    if (context.geoLocation && baseline.typical_locations) {
      const locationAnomaly = this.calculateLocationAnomaly(
        context.geoLocation, 
        baseline.typical_locations
      );
      features.location_anomaly = locationAnomaly;
      anomalyScore += locationAnomaly;
    }

    // Access pattern anomaly
    const pathAnomaly = this.calculatePathAnomaly(
      context.path,
      baseline.typical_paths || []
    );
    features.path_anomaly = pathAnomaly;
    anomalyScore += pathAnomaly;

    // Request frequency anomaly
    const frequencyAnomaly = await this.calculateFrequencyAnomaly(
      context.userId,
      baseline.avg_requests_per_hour || 10
    );
    features.frequency_anomaly = frequencyAnomaly;
    anomalyScore += frequencyAnomaly;

    // Device fingerprint anomaly
    const deviceAnomaly = this.calculateDeviceAnomaly(
      context.deviceFingerprint,
      baseline.known_devices || []
    );
    features.device_anomaly = deviceAnomaly;
    anomalyScore += deviceAnomaly;

    // Normalize score (0-1 range)
    const normalizedScore = Math.min(anomalyScore / 5, 1);
    const isAnomalous = normalizedScore >= model.anomalyThreshold;

    return {
      isAnomalous,
      score: normalizedScore,
      confidence: this.calculateConfidence(baseline.sample_size || 0),
      features,
      baseline
    };
  }

  /**
   * Run Network Anomaly Detection model
   */
  async runNetworkAnomalyModel(model, context) {
    const networkStats = await this.getNetworkStats(context.ipAddress);
    let anomalyScore = 0;
    const features = {};

    // Request rate anomaly
    const requestRate = networkStats.requestsLastMinute || 0;
    const avgRequestRate = networkStats.avgRequestsPerMinute || 5;
    const rateAnomaly = Math.min(requestRate / (avgRequestRate * 3), 1);
    features.rate_anomaly = rateAnomaly;
    anomalyScore += rateAnomaly * 0.3;

    // Error rate anomaly
    const errorRate = networkStats.errorRateLastMinute || 0;
    const avgErrorRate = networkStats.avgErrorRate || 0.1;
    const errorAnomaly = errorRate > avgErrorRate * 5 ? 0.5 : 0;
    features.error_anomaly = errorAnomaly;
    anomalyScore += errorAnomaly;

    // Payload size anomaly
    const payloadSize = context.features.request_size || 0;
    const avgPayloadSize = networkStats.avgPayloadSize || 1024;
    const sizeAnomaly = payloadSize > avgPayloadSize * 10 ? 0.4 : 0;
    features.size_anomaly = sizeAnomaly;
    anomalyScore += sizeAnomaly;

    // Endpoint diversity anomaly (accessing many different endpoints rapidly)
    const endpointDiversity = networkStats.uniqueEndpointsLastHour || 1;
    const diversityAnomaly = endpointDiversity > 50 ? 0.3 : 0;
    features.diversity_anomaly = diversityAnomaly;
    anomalyScore += diversityAnomaly;

    const normalizedScore = Math.min(anomalyScore, 1);
    const isAnomalous = normalizedScore >= model.anomalyThreshold;

    return {
      isAnomalous,
      score: normalizedScore,
      confidence: 0.8, // Network patterns are generally reliable
      features,
      networkStats
    };
  }

  /**
   * Calculate threat severity based on score and type
   */
  calculateThreatSeverity(score, threatType) {
    const baseSeverity = score;
    
    // Adjust severity based on threat type
    const severityMultipliers = {
      behavioral: 1.0,
      network: 1.2,
      data_access: 1.5,
      authentication: 1.3
    };

    const adjustedScore = baseSeverity * (severityMultipliers[threatType] || 1.0);

    if (adjustedScore >= 0.9) return 'CRITICAL';
    if (adjustedScore >= 0.7) return 'HIGH';
    if (adjustedScore >= 0.5) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Process threat detection results
   */
  async processThreatDetection(context, threats) {
    const threatId = crypto.randomUUID();
    const highestThreat = threats.reduce((max, threat) => 
      threat.score > max.score ? threat : max
    );

    const threatEvent = {
      threatId,
      timestamp: context.timestamp,
      userId: context.userId,
      tenantId: context.tenantId,
      ipAddress: context.ipAddress,
      requestId: context.requestId,
      threats,
      overallSeverity: highestThreat.severity,
      riskScore: this.calculateOverallRiskScore(threats),
      context: {
        path: context.path,
        method: context.method,
        userAgent: context.userAgent,
        geoLocation: context.geoLocation
      }
    };

    // Store active threat
    this.activeThreats.set(threatId, threatEvent);

    // Log threat detection
    logger.warn('Real-time threat detected', {
      threatId,
      severity: threatEvent.overallSeverity,
      riskScore: threatEvent.riskScore,
      threatTypes: threats.map(t => t.threatType)
    });

    // Send for correlation analysis
    await securityEventCorrelator.processSecurityEvent({
      eventType: 'THREAT_DETECTED',
      ...threatEvent
    });

    // Execute immediate response if high severity
    if (highestThreat.severity === 'CRITICAL' || highestThreat.severity === 'HIGH') {
      await this.executeImmediateResponse(threatEvent);
    }

    // Generate threat alert
    await this.generateThreatAlert(threatEvent);
  }

  /**
   * Execute immediate response to high-severity threats
   */
  async executeImmediateResponse(threatEvent) {
    try {
      const responses = [];

      // For critical threats
      if (threatEvent.overallSeverity === 'CRITICAL') {
        // Temporarily block the IP
        if (threatEvent.ipAddress) {
          await this.temporaryBlockIP(threatEvent.ipAddress, 300); // 5 minutes
          responses.push('IP_TEMPORARILY_BLOCKED');
        }

        // Require additional authentication
        if (threatEvent.userId) {
          await this.requireAdditionalAuth(threatEvent.userId);
          responses.push('ADDITIONAL_AUTH_REQUIRED');
        }
      }

      // For high threats
      if (threatEvent.overallSeverity === 'HIGH') {
        // Increase monitoring for this user/IP
        await this.increaseMonitoring(threatEvent.userId, threatEvent.ipAddress);
        responses.push('INCREASED_MONITORING');
      }

      // Log response actions
      logger.info('Immediate threat response executed', {
        threatId: threatEvent.threatId,
        responses
      });

    } catch (error) {
      logger.error('Failed to execute immediate threat response:', error);
    }
  }

  /**
   * Generate and send threat alert
   */
  async generateThreatAlert(threatEvent) {
    const alert = {
      alertId: crypto.randomUUID(),
      type: 'REAL_TIME_THREAT',
      severity: threatEvent.overallSeverity,
      title: `Real-time Threat Detection: ${threatEvent.overallSeverity} Risk`,
      message: this.generateThreatAlertMessage(threatEvent),
      timestamp: new Date(),
      metadata: {
        threatId: threatEvent.threatId,
        userId: threatEvent.userId,
        tenantId: threatEvent.tenantId,
        ipAddress: threatEvent.ipAddress,
        riskScore: threatEvent.riskScore
      }
    };

    // Send alert through notification system
    await this.sendThreatAlert(alert);
  }

  /**
   * Helper methods for various calculations
   */
  async getUserBaseline(userId) {
    if (!userId) return null;
    return await CacheService.get(`user_baseline:${userId}`);
  }

  calculateLocationAnomaly(currentLocation, typicalLocations) {
    if (!currentLocation || !typicalLocations.length) return 0;
    
    // Simple distance-based anomaly detection
    for (const location of typicalLocations) {
      const distance = this.calculateDistance(currentLocation, location);
      if (distance < 100) return 0; // Within 100km is normal
    }
    
    return 0.5; // New location detected
  }

  calculateDistance(loc1, loc2) {
    // Simplified distance calculation (Haversine formula)
    const R = 6371; // Earth's radius in km
    const dLat = (loc2.latitude - loc1.latitude) * Math.PI / 180;
    const dLon = (loc2.longitude - loc1.longitude) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(loc1.latitude * Math.PI / 180) * Math.cos(loc2.latitude * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  generateDeviceFingerprint(req) {
    const userAgent = req.get('User-Agent') || '';
    const acceptLanguage = req.get('Accept-Language') || '';
    const acceptEncoding = req.get('Accept-Encoding') || '';
    
    const fingerprintData = [userAgent, acceptLanguage, acceptEncoding].join('|');
    
    return crypto.createHash('sha256')
      .update(fingerprintData)
      .digest('hex')
      .substring(0, 16);
  }

  calculateOverallRiskScore(threats) {
    if (!threats.length) return 0;
    
    const maxScore = Math.max(...threats.map(t => t.score));
    const avgScore = threats.reduce((sum, t) => sum + t.score, 0) / threats.length;
    
    return Math.min((maxScore + avgScore) / 2, 1);
  }

  sanitizeHeaders(headers) {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    const sanitized = {};
    
    for (const [key, value] of Object.entries(headers)) {
      if (sensitiveHeaders.includes(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  hasComplexQuery(query) {
    if (!query) return false;
    
    const complexParams = ['$where', '$regex', '$or', '$and', '$nor'];
    return Object.keys(query).some(key => 
      complexParams.some(param => key.includes(param))
    );
  }
}

// Export singleton instance
export const realTimeThreatDetector = new RealTimeThreatDetector();
