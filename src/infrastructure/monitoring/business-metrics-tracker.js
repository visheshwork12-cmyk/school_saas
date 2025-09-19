// src/infrastructure/monitoring/business-metrics-tracker.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";

/**
 * Business Metrics Tracker
 * Tracks key business metrics for School ERP SaaS
 */
export class BusinessMetricsTracker extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.metricCollectors = new Map();
    this.dashboards = new Map();
    this.alerts = new Map();
    this.initializeBusinessMetrics();
  }

  /**
   * Initialize business metrics definitions
   */
  initializeBusinessMetrics() {
    // Student Engagement Metrics
    this.addMetricCollector('STUDENT_ENGAGEMENT', {
      name: 'Student Engagement Score',
      type: 'gauge',
      description: 'Overall student engagement across platform',
      collectors: [
        this.collectLoginFrequency.bind(this),
        this.collectAssignmentCompletionRate.bind(this),
        this.collectClassAttendance.bind(this),
        this.collectForumParticipation.bind(this)
      ],
      thresholds: {
        critical: 60,
        warning: 75,
        target: 85
      }
    });

    // Academic Performance Metrics
    this.addMetricCollector('ACADEMIC_PERFORMANCE', {
      name: 'Academic Performance Index',
      type: 'gauge',
      description: 'Overall academic performance metrics',
      collectors: [
        this.collectAverageGrades.bind(this),
        this.collectPassRates.bind(this),
        this.collectImprovementTrends.bind(this)
      ],
      thresholds: {
        critical: 70,
        warning: 80,
        target: 90
      }
    });

    // Financial Metrics
    this.addMetricCollector('FINANCIAL_HEALTH', {
      name: 'Financial Health Score',
      type: 'gauge',
      description: 'School financial performance indicators',
      collectors: [
        this.collectFeeCollectionRate.bind(this),
        this.collectRevenueGrowth.bind(this),
        this.collectCostPerStudent.bind(this)
      ],
      thresholds: {
        critical: 75,
        warning: 85,
        target: 95
      }
    });

    // Operational Efficiency Metrics
    this.addMetricCollector('OPERATIONAL_EFFICIENCY', {
      name: 'Operational Efficiency Index',
      type: 'gauge',
      description: 'School operational performance metrics',
      collectors: [
        this.collectStaffUtilization.bind(this),
        this.collectResourceOptimization.bind(this),
        this.collectProcessAutomation.bind(this)
      ],
      thresholds: {
        critical: 70,
        warning: 80,
        target: 90
      }
    });

    // Parent Satisfaction Metrics
    this.addMetricCollector('PARENT_SATISFACTION', {
      name: 'Parent Satisfaction Score',
      type: 'gauge',
      description: 'Parent satisfaction and engagement metrics',
      collectors: [
        this.collectParentPortalUsage.bind(this),
        this.collectCommunicationResponse.bind(this),
        this.collectFeedbackScores.bind(this)
      ],
      thresholds: {
        critical: 70,
        warning: 80,
        target: 90
      }
    });
  }

  /**
   * Collect and process business metrics
   */
  async collectBusinessMetrics() {
    try {
      logger.info('Collecting business metrics');

      const metricsResults = new Map();

      for (const [metricId, config] of this.metricCollectors) {
        try {
          const metricData = {
            id: metricId,
            name: config.name,
            timestamp: new Date(),
            values: {},
            score: 0,
            status: 'unknown'
          };

          // Execute all collectors for this metric
          const collectorResults = await Promise.all(
            config.collectors.map(async (collector, index) => {
              try {
                const result = await collector();
                return { index, result };
              } catch (error) {
                logger.warn(`Collector ${index} failed for ${metricId}:`, error.message);
                return { index, result: null };
              }
            })
          );

          // Process collector results
          let totalScore = 0;
          let validCollectors = 0;

          collectorResults.forEach(({ index, result }) => {
            if (result) {
              metricData.values[`collector_${index}`] = result;
              totalScore += result.score || 0;
              validCollectors++;
            }
          });

          // Calculate overall metric score
          if (validCollectors > 0) {
            metricData.score = Math.round(totalScore / validCollectors);
            metricData.status = this.determineMetricStatus(metricData.score, config.thresholds);
          }

          metricsResults.set(metricId, metricData);
          
          // Store in metrics history
          this.storeMetricData(metricId, metricData);

          // Check alert thresholds
          await this.checkAlertThresholds(metricId, metricData, config);

        } catch (error) {
          logger.error(`Failed to collect metric ${metricId}:`, error);
        }
      }

      // Emit metrics collected event
      this.emit('metricsCollected', metricsResults);

      logger.info(`Business metrics collected: ${metricsResults.size} metrics`);
      return metricsResults;

    } catch (error) {
      logger.error('Business metrics collection failed:', error);
      throw error;
    }
  }

  /**
   * Student engagement collectors
   */
  async collectLoginFrequency() {
    // Simulate database query for student login frequency
    const result = {
      name: 'Login Frequency',
      value: 85,
      score: 85,
      unit: 'percentage',
      description: 'Percentage of active students logging in daily'
    };
    return result;
  }

  async collectAssignmentCompletionRate() {
    const result = {
      name: 'Assignment Completion',
      value: 78,
      score: 78,
      unit: 'percentage',
      description: 'Assignment completion rate across all classes'
    };
    return result;
  }

  async collectClassAttendance() {
    const result = {
      name: 'Class Attendance',
      value: 92,
      score: 92,
      unit: 'percentage',
      description: 'Overall class attendance rate'
    };
    return result;
  }

  async collectForumParticipation() {
    const result = {
      name: 'Forum Participation',
      value: 65,
      score: 65,
      unit: 'percentage',
      description: 'Student participation in discussion forums'
    };
    return result;
  }

  /**
   * Academic performance collectors
   */
  async collectAverageGrades() {
    const result = {
      name: 'Average Grades',
      value: 82,
      score: 82,
      unit: 'percentage',
      description: 'Average grade across all subjects and classes'
    };
    return result;
  }

  async collectPassRates() {
    const result = {
      name: 'Pass Rates',
      value: 89,
      score: 89,
      unit: 'percentage',
      description: 'Overall pass rate for current term'
    };
    return result;
  }

  async collectImprovementTrends() {
    const result = {
      name: 'Improvement Trends',
      value: 75,
      score: 75,
      unit: 'index',
      description: 'Student improvement trend indicator'
    };
    return result;
  }

  /**
   * Financial health collectors
   */
  async collectFeeCollectionRate() {
    const result = {
      name: 'Fee Collection Rate',
      value: 94,
      score: 94,
      unit: 'percentage',
      description: 'Percentage of fees collected on time'
    };
    return result;
  }

  async collectRevenueGrowth() {
    const result = {
      name: 'Revenue Growth',
      value: 12,
      score: 85, // Convert to score based on target
      unit: 'percentage',
      description: 'Year-over-year revenue growth'
    };
    return result;
  }

  async collectCostPerStudent() {
    const result = {
      name: 'Cost Per Student',
      value: 450,
      score: 78,
      unit: 'currency',
      description: 'Average operational cost per student per month'
    };
    return result;
  }

  /**
   * Create business dashboard
   */
  async createBusinessDashboard(dashboardId, config) {
    try {
      const dashboard = {
        id: dashboardId,
        name: config.name,
        description: config.description,
        widgets: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Add metric widgets
      for (const metricId of config.metrics) {
        const metricConfig = this.metricCollectors.get(metricId);
        if (metricConfig) {
          dashboard.widgets.push({
            type: 'metric',
            metricId,
            title: metricConfig.name,
            size: config.widgetSize || 'medium',
            position: dashboard.widgets.length
          });
        }
      }

      // Add trend widgets
      if (config.includeTrends) {
        dashboard.widgets.push({
          type: 'trends',
          title: 'Business Metrics Trends',
          metrics: config.metrics,
          timeRange: '30d',
          size: 'large',
          position: dashboard.widgets.length
        });
      }

      // Add alert summary widget
      if (config.includeAlerts) {
        dashboard.widgets.push({
          type: 'alerts',
          title: 'Active Alerts',
          severity: ['critical', 'warning'],
          size: 'medium',
          position: dashboard.widgets.length
        });
      }

      this.dashboards.set(dashboardId, dashboard);

      logger.info(`Business dashboard created: ${dashboardId}`);
      return dashboard;

    } catch (error) {
      logger.error(`Failed to create dashboard ${dashboardId}:`, error);
      throw error;
    }
  }

  /**
   * Generate business insights
   */
  async generateBusinessInsights(timeRange = '30d') {
    try {
      const insights = {
        generatedAt: new Date(),
        timeRange,
        summary: {},
        trends: {},
        recommendations: [],
        alerts: []
      };

      // Collect current metrics
      const currentMetrics = await this.collectBusinessMetrics();

      // Calculate summary statistics
      let totalScore = 0;
      let metricCount = 0;
      const statusCounts = { critical: 0, warning: 0, good: 0 };

      for (const [metricId, metricData] of currentMetrics) {
        totalScore += metricData.score;
        metricCount++;
        statusCounts[metricData.status] = (statusCounts[metricData.status] || 0) + 1;
      }

      insights.summary = {
        overallScore: Math.round(totalScore / metricCount),
        totalMetrics: metricCount,
        statusDistribution: statusCounts,
        healthGrade: this.calculateHealthGrade(totalScore / metricCount)
      };

      // Generate recommendations
      insights.recommendations = await this.generateRecommendations(currentMetrics);

      // Collect active alerts
      insights.alerts = this.getActiveAlerts();

      logger.info('Business insights generated', {
        overallScore: insights.summary.overallScore,
        recommendations: insights.recommendations.length,
        alerts: insights.alerts.length
      });

      return insights;

    } catch (error) {
      logger.error('Failed to generate business insights:', error);
      throw error;
    }
  }

  // Helper methods
  addMetricCollector(metricId, config) {
    this.metricCollectors.set(metricId, config);
    logger.debug(`Metric collector added: ${metricId}`);
  }

  storeMetricData(metricId, data) {
    if (!this.metrics.has(metricId)) {
      this.metrics.set(metricId, []);
    }
    
    const metricHistory = this.metrics.get(metricId);
    metricHistory.push(data);

    // Keep only last 1000 data points
    if (metricHistory.length > 1000) {
      metricHistory.splice(0, metricHistory.length - 1000);
    }
  }

  determineMetricStatus(score, thresholds) {
    if (score < thresholds.critical) return 'critical';
    if (score < thresholds.warning) return 'warning';
    return 'good';
  }

  async checkAlertThresholds(metricId, metricData, config) {
    const status = metricData.status;
    
    if (status === 'critical' || status === 'warning') {
      const alert = {
        id: `${metricId}_${Date.now()}`,
        metricId,
        severity: status,
        message: `${config.name} is ${status}: ${metricData.score}`,
        timestamp: new Date(),
        threshold: config.thresholds[status],
        actualValue: metricData.score
      };

      this.alerts.set(alert.id, alert);
      this.emit('alert', alert);
    }
  }

  calculateHealthGrade(score) {
    if (score >= 90) return 'A+';
    if (score >= 85) return 'A';
    if (score >= 80) return 'B+';
    if (score >= 75) return 'B';
    if (score >= 70) return 'C+';
    if (score >= 65) return 'C';
    return 'D';
  }

  async generateRecommendations(metrics) {
    const recommendations = [];

    for (const [metricId, metricData] of metrics) {
      if (metricData.status === 'critical') {
        recommendations.push({
          type: 'URGENT_ACTION',
          metricId,
          priority: 'HIGH',
          title: `Improve ${metricData.name}`,
          description: `${metricData.name} score is critically low at ${metricData.score}%`,
          suggestions: this.getMetricSpecificSuggestions(metricId, metricData.score)
        });
      } else if (metricData.status === 'warning') {
        recommendations.push({
          type: 'IMPROVEMENT_OPPORTUNITY',
          metricId,
          priority: 'MEDIUM',
          title: `Optimize ${metricData.name}`,
          description: `${metricData.name} has room for improvement`,
          suggestions: this.getMetricSpecificSuggestions(metricId, metricData.score)
        });
      }
    }

    return recommendations;
  }

  getMetricSpecificSuggestions(metricId, score) {
    const suggestions = {
      'STUDENT_ENGAGEMENT': [
        'Implement gamification features',
        'Increase interactive content',
        'Improve mobile app experience',
        'Add peer collaboration tools'
      ],
      'ACADEMIC_PERFORMANCE': [
        'Provide additional tutoring resources',
        'Implement adaptive learning paths',
        'Enhance teacher training programs',
        'Improve assessment methods'
      ],
      'FINANCIAL_HEALTH': [
        'Optimize fee collection processes',
        'Implement automated payment reminders',
        'Review cost optimization opportunities',
        'Diversify revenue streams'
      ],
      'OPERATIONAL_EFFICIENCY': [
        'Automate manual processes',
        'Improve staff training',
        'Optimize resource allocation',
        'Implement workflow improvements'
      ],
      'PARENT_SATISFACTION': [
        'Enhance communication channels',
        'Improve parent portal features',
        'Increase transparency in reporting',
        'Provide better support channels'
      ]
    };

    return suggestions[metricId] || ['Review current processes and identify improvement areas'];
  }

  getActiveAlerts(severity = null) {
    const alerts = Array.from(this.alerts.values());
    
    if (severity) {
      return alerts.filter(alert => alert.severity === severity);
    }
    
    return alerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  getMetricHistory(metricId, limit = 100) {
    const history = this.metrics.get(metricId) || [];
    return history.slice(-limit);
  }

  getDashboard(dashboardId) {
    return this.dashboards.get(dashboardId);
  }

  getAllMetrics() {
    return Array.from(this.metricCollectors.keys());
  }
}

// Export singleton instance
export const businessMetricsTracker = new BusinessMetricsTracker();
