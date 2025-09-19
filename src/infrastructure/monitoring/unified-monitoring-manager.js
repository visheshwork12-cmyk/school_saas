// src/infrastructure/monitoring/unified-monitoring-manager.js
import { businessMetricsTracker } from "./business-metrics-tracker.js";
import { performanceProfiler } from "./performance-profiler.js";
import { enhancedErrorTracker } from "./enhanced-error-tracker.js";
import { userBehaviorAnalytics } from "./user-behavior-analytics.js";
import { resourceUtilizationMonitor } from "./resource-utilization-monitor.js";
import { logger } from "#utils/core/logger.js";

/**
 * Unified Monitoring & Analytics Manager
 * Orchestrates all monitoring and analytics components
 */
export class UnifiedMonitoringManager {
  constructor() {
    this.monitors = {
      business: businessMetricsTracker,
      performance: performanceProfiler,
      errors: enhancedErrorTracker,
      behavior: userBehaviorAnalytics,
      resources: resourceUtilizationMonitor
    };
    this.dashboards = new Map();
    this.alerts = new Map();
    this.reports = new Map();
  }

  /**
   * Initialize comprehensive monitoring
   */
  async initializeMonitoring(config = {}) {
    try {
      logger.info('Initializing unified monitoring system');

      const results = {
        startTime: new Date(),
        initialized: [],
        failed: []
      };

      // Initialize business metrics
      if (config.enableBusinessMetrics !== false) {
        try {
          await this.monitors.business.collectBusinessMetrics();
          results.initialized.push('business_metrics');
        } catch (error) {
          results.failed.push({ component: 'business_metrics', error: error.message });
        }
      }

      // Initialize performance profiling
      if (config.enablePerformanceProfiling !== false) {
        try {
          const profilerStatus = this.monitors.performance.getProfilingStatus();
          if (!profilerStatus.active && config.startProfiling) {
            await this.monitors.performance.startProfiling(config.profilingOptions);
          }
          results.initialized.push('performance_profiling');
        } catch (error) {
          results.failed.push({ component: 'performance_profiling', error: error.message });
        }
      }

      // Initialize error tracking
      if (config.enableErrorTracking !== false) {
        try {
          // Error tracking is already initialized via global handlers
          results.initialized.push('error_tracking');
        } catch (error) {
          results.failed.push({ component: 'error_tracking', error: error.message });
        }
      }

      // Initialize user behavior analytics
      if (config.enableBehaviorAnalytics !== false) {
        try {
          // Behavior analytics is already initialized
          results.initialized.push('behavior_analytics');
        } catch (error) {
          results.failed.push({ component: 'behavior_analytics', error: error.message });
        }
      }

      // Initialize resource monitoring
      if (config.enableResourceMonitoring !== false) {
        try {
          await this.monitors.resources.startMonitoring();
          results.initialized.push('resource_monitoring');
        } catch (error) {
          results.failed.push({ component: 'resource_monitoring', error: error.message });
        }
      }

      // Setup unified dashboard
      if (config.createDashboard !== false) {
        await this.createUnifiedDashboard();
        results.initialized.push('unified_dashboard');
      }

      // Setup cross-component alerts
      this.setupUnifiedAlerts();
      results.initialized.push('unified_alerts');

      results.endTime = new Date();
      results.duration = results.endTime - results.startTime;

      logger.info('Unified monitoring system initialized', {
        initialized: results.initialized.length,
        failed: results.failed.length,
        duration: results.duration
      });

      return results;

    } catch (error) {
      logger.error('Failed to initialize unified monitoring:', error);
      throw error;
    }
  }

  /**
   * Generate comprehensive monitoring report
   */
  async generateComprehensiveReport(options = {}) {
    try {
      logger.info('Generating comprehensive monitoring report');

      const report = {
        generatedAt: new Date(),
        timeRange: options.timeRange || '24h',
        summary: {
          overallHealth: 'UNKNOWN',
          totalAlerts: 0,
          criticalIssues: 0,
          performanceScore: 0,
          userSatisfactionScore: 0
        },
        components: {}
      };

      // Business metrics report
      try {
        const businessInsights = await this.monitors.business.generateBusinessInsights(options.timeRange);
        report.components.business = {
          status: 'SUCCESS',
          data: businessInsights,
          health: businessInsights.summary.healthGrade
        };
      } catch (error) {
        report.components.business = { status: 'ERROR', error: error.message };
      }

      // Performance report
      try {
        const performanceAnalysis = await this.monitors.performance.analyzeBottlenecks(options.timeRange);
        report.components.performance = {
          status: 'SUCCESS',
          data: performanceAnalysis,
          health: performanceAnalysis.recommendations.length > 0 ? 'WARNING' : 'HEALTHY'
        };
      } catch (error) {
        report.components.performance = { status: 'ERROR', error: error.message };
      }

      // Error tracking report
      try {
        const errorAnalysis = await this.monitors.errors.analyzeErrorTrends(options.timeRange);
        report.components.errors = {
          status: 'SUCCESS',
          data: errorAnalysis,
          health: errorAnalysis.summary.criticalErrors > 0 ? 'CRITICAL' : 'HEALTHY'
        };
      } catch (error) {
        report.components.errors = { status: 'ERROR', error: error.message };
      }

      // User behavior report
      try {
        const behaviorInsights = await this.monitors.behavior.generateBehaviorInsights(options);
        report.components.behavior = {
          status: 'SUCCESS',
          data: behaviorInsights,
          health: behaviorInsights.overview.atRiskUsers > behaviorInsights.overview.totalUsers * 0.1 ? 'WARNING' : 'HEALTHY'
        };
      } catch (error) {
        report.components.behavior = { status: 'ERROR', error: error.message };
      }

      // Resource utilization report
      try {
        const resourceReport = await this.monitors.resources.generateResourceReport(options.timeRange);
        report.components.resources = {
          status: 'SUCCESS',
          data: resourceReport,
          health: resourceReport.summary.overallHealth
        };
      } catch (error) {
        report.components.resources = { status: 'ERROR', error: error.message };
      }

      // Calculate overall metrics
      report.summary = this.calculateOverallSummary(report.components);

      // Store report
      const reportId = `report_${Date.now()}`;
      this.reports.set(reportId, report);

      logger.info('Comprehensive monitoring report generated', {
        reportId,
        overallHealth: report.summary.overallHealth,
        components: Object.keys(report.components).length
      });

      return { reportId, ...report };

    } catch (error) {
      logger.error('Failed to generate comprehensive report:', error);
      throw error;
    }
  }

  /**
   * Create unified monitoring dashboard
   */
  async createUnifiedDashboard() {
    try {
      const dashboard = {
        id: 'unified_monitoring_dashboard',
        name: 'School ERP - Unified Monitoring Dashboard',
        description: 'Comprehensive monitoring dashboard for all system components',
        sections: [
          {
            title: 'System Health Overview',
            widgets: [
              { type: 'health_status', component: 'overall' },
              { type: 'alert_summary', component: 'all' },
              { type: 'performance_score', component: 'performance' }
            ]
          },
          {
            title: 'Business Metrics',
            widgets: [
              { type: 'student_engagement', component: 'business' },
              { type: 'academic_performance', component: 'business' },
              { type: 'financial_health', component: 'business' }
            ]
          },
          {
            title: 'Technical Performance',
            widgets: [
              { type: 'response_time', component: 'performance' },
              { type: 'error_rate', component: 'errors' },
              { type: 'resource_utilization', component: 'resources' }
            ]
          },
          {
            title: 'User Experience',
            widgets: [
              { type: 'active_users', component: 'behavior' },
              { type: 'user_satisfaction', component: 'behavior' },
              { type: 'feature_adoption', component: 'behavior' }
            ]
          }
        ],
        refreshInterval: 30000, // 30 seconds
        createdAt: new Date()
      };

      this.dashboards.set(dashboard.id, dashboard);

      logger.info(`Unified dashboard created: ${dashboard.id}`);
      return dashboard;

    } catch (error) {
      logger.error('Failed to create unified dashboard:', error);
      throw error;
    }
  }

  /**
   * Setup cross-component alerts
   */
  setupUnifiedAlerts() {
    // Listen to alerts from all components
    this.monitors.business.on('alert', (alert) => this.handleUnifiedAlert('business', alert));
    this.monitors.performance.on('alert', (alert) => this.handleUnifiedAlert('performance', alert));
    this.monitors.errors.on('alert', (alert) => this.handleUnifiedAlert('errors', alert));
    this.monitors.errors.on('criticalAlert', (alert) => this.handleUnifiedAlert('errors', alert));
    this.monitors.behavior.on('alert', (alert) => this.handleUnifiedAlert('behavior', alert));
    this.monitors.resources.on('alert', (alert) => this.handleUnifiedAlert('resources', alert));

    logger.info('Unified alerts setup completed');
  }

  /**
   * Handle unified alerts from all components
   */
  async handleUnifiedAlert(component, alert) {
    try {
      const unifiedAlert = {
        id: `unified_${alert.id}`,
        component,
        originalAlert: alert,
        timestamp: new Date(),
        processed: false,
        correlations: await this.findAlertCorrelations(component, alert)
      };

      this.alerts.set(unifiedAlert.id, unifiedAlert);

      // Check for alert storms or patterns
      await this.analyzeAlertPatterns(unifiedAlert);

      logger.warn(`Unified alert processed: ${component}.${alert.id}`);

    } catch (error) {
      logger.error('Failed to handle unified alert:', error);
    }
  }

  /**
   * Find correlations between alerts
   */
  async findAlertCorrelations(component, alert) {
    const correlations = [];
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const alertTime = alert.timestamp || new Date();

    // Find related alerts within time window
    for (const [alertId, existingAlert] of this.alerts) {
      if (existingAlert.component !== component && 
          Math.abs(existingAlert.timestamp - alertTime) <= timeWindow) {
        correlations.push({
          alertId: existingAlert.id,
          component: existingAlert.component,
          timeDiff: Math.abs(existingAlert.timestamp - alertTime)
        });
      }
    }

    return correlations;
  }

  /**
   * Analyze alert patterns for potential issues
   */
  async analyzeAlertPatterns(unifiedAlert) {
    const recentAlerts = Array.from(this.alerts.values())
      .filter(alert => 
        (new Date() - alert.timestamp) <= 600000 && // Last 10 minutes
        alert.component === unifiedAlert.component
      );

    // Alert storm detection
    if (recentAlerts.length > 10) {
      logger.warn(`Alert storm detected in ${unifiedAlert.component}: ${recentAlerts.length} alerts in 10 minutes`);
      
      // Could trigger escalation or alert suppression here
    }

    // Pattern detection (simplified)
    const patternAlert = {
      id: `pattern_${Date.now()}`,
      type: 'PATTERN_DETECTION',
      component: unifiedAlert.component,
      pattern: `High alert frequency: ${recentAlerts.length} alerts`,
      timestamp: new Date()
    };

    if (recentAlerts.length > 5) {
      this.alerts.set(patternAlert.id, patternAlert);
    }
  }

  // Helper methods
  calculateOverallSummary(components) {
    let healthScore = 100;
    let totalAlerts = 0;
    let criticalIssues = 0;

    for (const [componentName, component] of Object.entries(components)) {
      if (component.status === 'ERROR') {
        healthScore -= 20;
        criticalIssues++;
      } else if (component.health === 'CRITICAL') {
        healthScore -= 15;
        criticalIssues++;
      } else if (component.health === 'WARNING') {
        healthScore -= 5;
      }

      if (component.data && component.data.summary) {
        totalAlerts += component.data.summary.totalAlerts || 0;
      }
    }

    return {
      overallHealth: this.calculateHealthGrade(healthScore),
      totalAlerts,
      criticalIssues,
      performanceScore: Math.max(healthScore, 0),
      userSatisfactionScore: healthScore > 80 ? 85 : healthScore > 60 ? 70 : 50
    };
  }

  calculateHealthGrade(score) {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 80) return 'GOOD';
    if (score >= 70) return 'FAIR';
    if (score >= 60) return 'WARNING';
    return 'CRITICAL';
  }

  // Public getters
  getMonitoringStatus() {
    return {
      business: this.monitors.business ? 'ACTIVE' : 'INACTIVE',
      performance: this.monitors.performance.getProfilingStatus().active ? 'ACTIVE' : 'INACTIVE',
      errors: 'ACTIVE', // Always active via global handlers
      behavior: 'ACTIVE', // Always active
      resources: this.monitors.resources.getMonitoringStatus().active ? 'ACTIVE' : 'INACTIVE'
    };
  }

  getActiveAlerts() {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.processed)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  getDashboard(dashboardId) {
    return this.dashboards.get(dashboardId);
  }

  getReport(reportId) {
    return this.reports.get(reportId);
  }
}

// Export singleton instance
export const unifiedMonitoringManager = new UnifiedMonitoringManager();
