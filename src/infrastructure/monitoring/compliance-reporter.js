// src/infrastructure/monitoring/compliance-reporter.js
import { logger } from "#utils/core/logger.js";
import { integrityProtectedAuditService } from "./integrity-protected-audit.service.js";
import moment from "moment";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

/**
 * Automated Compliance Reporting System
 */
export class ComplianceReporter {
  constructor() {
    this.reportingSchedules = new Map();
    this.complianceStandards = new Map();
    this.reportTemplates = new Map();
    this.initializeComplianceStandards();
    this.setupReportingSchedules();
  }

  /**
   * Initialize compliance standards and their requirements
   */
  initializeComplianceStandards() {
    // GDPR Compliance
    this.addComplianceStandard('GDPR', {
      name: 'General Data Protection Regulation',
      requirements: [
        'data_processing_log',
        'consent_records',
        'breach_notifications',
        'data_subject_requests',
        'privacy_impact_assessments'
      ],
      reportingFrequency: 'monthly',
      retentionPeriod: '6 years',
      auditFields: [
        'DATA_PROCESSED',
        'CONSENT_GIVEN',
        'CONSENT_WITHDRAWN',
        'DATA_EXPORTED',
        'DATA_DELETED',
        'BREACH_DETECTED',
        'PRIVACY_REQUEST'
      ]
    });

    // SOC 2 Compliance
    this.addComplianceStandard('SOC2', {
      name: 'Service Organization Control 2',
      requirements: [
        'access_controls',
        'system_monitoring',
        'incident_response',
        'change_management',
        'vendor_management'
      ],
      reportingFrequency: 'quarterly',
      retentionPeriod: '7 years',
      auditFields: [
        'USER_ACCESS_GRANTED',
        'USER_ACCESS_REVOKED',
        'SYSTEM_CHANGE',
        'SECURITY_INCIDENT',
        'MONITORING_ALERT',
        'BACKUP_COMPLETED'
      ]
    });

    // FERPA Compliance (for educational institutions)
    this.addComplianceStandard('FERPA', {
      name: 'Family Educational Rights and Privacy Act',
      requirements: [
        'student_record_access',
        'disclosure_logs',
        'consent_documentation',
        'directory_information_handling'
      ],
      reportingFrequency: 'annually',
      retentionPeriod: '5 years',
      auditFields: [
        'STUDENT_RECORD_ACCESSED',
        'STUDENT_RECORD_DISCLOSED',
        'PARENT_CONSENT_GIVEN',
        'DIRECTORY_INFO_RELEASED'
      ]
    });

    // HIPAA Compliance (if handling health data)
    this.addComplianceStandard('HIPAA', {
      name: 'Health Insurance Portability and Accountability Act',
      requirements: [
        'phi_access_log',
        'breach_assessment',
        'business_associate_agreements',
        'risk_assessments'
      ],
      reportingFrequency: 'monthly',
      retentionPeriod: '6 years',
      auditFields: [
        'PHI_ACCESSED',
        'PHI_DISCLOSED',
        'HEALTH_RECORD_MODIFIED',
        'BREACH_SUSPECTED'
      ]
    });
  }

  /**
   * Add compliance standard
   */
  addComplianceStandard(standardId, standard) {
    this.complianceStandards.set(standardId, {
      ...standard,
      id: standardId,
      createdAt: new Date(),
      lastReportGenerated: null
    });

    logger.info(`Compliance standard added: ${standardId}`);
  }

  /**
   * Setup automated reporting schedules
   */
  setupReportingSchedules() {
    for (const [standardId, standard] of this.complianceStandards) {
      this.scheduleReport(standardId, standard.reportingFrequency);
    }
  }

  /**
   * Schedule compliance report generation
   */
  scheduleReport(standardId, frequency) {
    const schedule = {
      standardId,
      frequency,
      nextRun: this.calculateNextRunTime(frequency),
      isActive: true
    };

    this.reportingSchedules.set(standardId, schedule);
    
    // Set up actual scheduling (would use cron job in production)
    this.setupCronJob(standardId, frequency);
  }

  /**
   * Calculate next run time based on frequency
   */
  calculateNextRunTime(frequency) {
    const now = moment();
    
    switch (frequency) {
      case 'daily':
        return now.add(1, 'day').startOf('day').toDate();
      case 'weekly':
        return now.add(1, 'week').startOf('week').toDate();
      case 'monthly':
        return now.add(1, 'month').startOf('month').toDate();
      case 'quarterly':
        return now.add(3, 'months').startOf('quarter').toDate();
      case 'annually':
        return now.add(1, 'year').startOf('year').toDate();
      default:
        return now.add(1, 'month').startOf('month').toDate();
    }
  }

  /**
   * Generate compliance report for a specific standard
   */
  async generateComplianceReport(standardId, startDate, endDate) {
    try {
      const standard = this.complianceStandards.get(standardId);
      if (!standard) {
        throw new Error(`Compliance standard not found: ${standardId}`);
      }

      logger.info(`Generating compliance report for ${standardId}`, {
        startDate,
        endDate
      });

      // Collect audit data
      const auditData = await this.collectAuditData(standard, startDate, endDate);
      
      // Analyze compliance metrics
      const metrics = await this.analyzeComplianceMetrics(standard, auditData);
      
      // Generate report
      const report = await this.buildComplianceReport(standard, metrics, auditData, startDate, endDate);
      
      // Save report
      const savedReport = await this.saveComplianceReport(report);
      
      // Update last report generation time
      standard.lastReportGenerated = new Date();
      
      logger.info(`Compliance report generated: ${savedReport.reportId}`, {
        standardId,
        reportPath: savedReport.filePath
      });

      return savedReport;

    } catch (error) {
      logger.error(`Failed to generate compliance report for ${standardId}:`, error);
      throw error;
    }
  }

  /**
   * Collect audit data for compliance reporting
   */
  async collectAuditData(standard, startDate, endDate) {
    const auditData = {
      totalEntries: 0,
      relevantEntries: [],
      categorizedEvents: {},
      integrityStatus: 'UNKNOWN'
    };

    try {
      // Get all audit entries in the period
      const allEntries = await integrityProtectedAuditService.getAuditEntries(startDate, endDate);
      auditData.totalEntries = allEntries.length;

      // Filter relevant entries for this compliance standard
      const relevantEntries = allEntries.filter(entry => 
        standard.auditFields.includes(entry.eventType)
      );
      auditData.relevantEntries = relevantEntries;

      // Categorize events
      for (const entry of relevantEntries) {
        if (!auditData.categorizedEvents[entry.eventType]) {
          auditData.categorizedEvents[entry.eventType] = [];
        }
        auditData.categorizedEvents[entry.eventType].push(entry);
      }

      // Verify audit log integrity
      const integrityCheck = await integrityProtectedAuditService.verifyAuditIntegrity(startDate, endDate);
      auditData.integrityStatus = integrityCheck.corruptedEntries === 0 ? 'INTACT' : 'COMPROMISED';
      auditData.integrityDetails = integrityCheck;

      return auditData;

    } catch (error) {
      logger.error('Failed to collect audit data:', error);
      throw error;
    }
  }

  /**
   * Analyze compliance metrics
   */
  async analyzeComplianceMetrics(standard, auditData) {
    const metrics = {
      complianceScore: 0,
      totalRequirements: standard.requirements.length,
      metRequirements: 0,
      violations: [],
      recommendations: [],
      riskLevel: 'LOW'
    };

    // Analyze each requirement
    for (const requirement of standard.requirements) {
      const analysis = await this.analyzeRequirement(requirement, standard, auditData);
      
      if (analysis.compliant) {
        metrics.metRequirements++;
      } else {
        metrics.violations.push({
          requirement,
          severity: analysis.severity,
          details: analysis.details,
          recommendations: analysis.recommendations
        });
      }
    }

    // Calculate compliance score
    metrics.complianceScore = (metrics.metRequirements / metrics.totalRequirements) * 100;

    // Determine risk level
    if (metrics.complianceScore >= 95) {
      metrics.riskLevel = 'LOW';
    } else if (metrics.complianceScore >= 80) {
      metrics.riskLevel = 'MEDIUM';
    } else {
      metrics.riskLevel = 'HIGH';
    }

    // Generate overall recommendations
    if (metrics.complianceScore < 100) {
      metrics.recommendations.push('Review and address identified compliance gaps');
      metrics.recommendations.push('Implement additional monitoring for non-compliant areas');
    }

    return metrics;
  }

  /**
   * Analyze specific compliance requirement
   */
  async analyzeRequirement(requirement, standard, auditData) {
    switch (requirement) {
      case 'data_processing_log':
        return this.analyzeDataProcessingCompliance(auditData);
      
      case 'access_controls':
        return this.analyzeAccessControlCompliance(auditData);
      
      case 'breach_notifications':
        return this.analyzeBreachNotificationCompliance(auditData);
      
      case 'student_record_access':
        return this.analyzeStudentRecordAccessCompliance(auditData);
      
      default:
        return {
          compliant: true,
          severity: 'LOW',
          details: 'Requirement analysis not implemented',
          recommendations: []
        };
    }
  }

  /**
   * Build compliance report structure
   */
  async buildComplianceReport(standard, metrics, auditData, startDate, endDate) {
    const report = {
      reportId: crypto.randomUUID(),
      generatedAt: new Date(),
      standard: {
        id: standard.id,
        name: standard.name
      },
      reportPeriod: {
        startDate,
        endDate,
        durationDays: moment(endDate).diff(moment(startDate), 'days')
      },
      executiveSummary: {
        complianceScore: metrics.complianceScore,
        riskLevel: metrics.riskLevel,
        totalAuditEntries: auditData.totalEntries,
        relevantEntries: auditData.relevantEntries.length,
        auditIntegrity: auditData.integrityStatus
      },
      detailedFindings: {
        metRequirements: metrics.metRequirements,
        totalRequirements: metrics.totalRequirements,
        violations: metrics.violations,
        recommendations: metrics.recommendations
      },
      auditTrail: {
        integrityVerification: auditData.integrityDetails,
        eventCategories: Object.keys(auditData.categorizedEvents).map(eventType => ({
          eventType,
          count: auditData.categorizedEvents[eventType].length,
          samples: auditData.categorizedEvents[eventType].slice(0, 5)
        }))
      },
      appendices: {
        fullAuditLog: auditData.relevantEntries.length < 1000 
          ? auditData.relevantEntries 
          : `${auditData.relevantEntries.length} entries (truncated for report size)`
      }
    };

    return report;
  }

  /**
   * Save compliance report to file system
   */
  async saveComplianceReport(report) {
    const reportsDir = process.env.COMPLIANCE_REPORTS_DIR || './compliance-reports';
    const standardDir = path.join(reportsDir, report.standard.id);
    
    // Ensure directories exist
    await fs.mkdir(standardDir, { recursive: true });
    
    const timestamp = moment(report.generatedAt).format('YYYY-MM-DD_HH-mm-ss');
    const filename = `${report.standard.id}_compliance_report_${timestamp}.json`;
    const filePath = path.join(standardDir, filename);
    
    // Save JSON report
    await fs.writeFile(filePath, JSON.stringify(report, null, 2));
    
    // Generate human-readable HTML report
    const htmlReport = await this.generateHTMLReport(report);
    const htmlPath = filePath.replace('.json', '.html');
    await fs.writeFile(htmlPath, htmlReport);
    
    // Log report creation
    await integrityProtectedAuditService.createProtectedAuditLog({
      eventType: 'COMPLIANCE_REPORT_GENERATED',
      action: 'generate_compliance_report',
      details: {
        reportId: report.reportId,
        standard: report.standard.id,
        complianceScore: report.executiveSummary.complianceScore,
        riskLevel: report.executiveSummary.riskLevel,
        reportPath: filePath
      },
      tenantId: 'system',
      userId: 'system'
    });
    
    return {
      reportId: report.reportId,
      filePath,
      htmlPath,
      report
    };
  }

  /**
   * Generate HTML report for human readability
   */
  async generateHTMLReport(report) {
    const template = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${report.standard.name} Compliance Report</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f5f5f5; padding: 20px; border-left: 5px solid #007cba; }
        .summary { background: #e8f4fd; padding: 15px; margin: 20px 0; }
        .risk-low { color: #28a745; }
        .risk-medium { color: #ffc107; }
        .risk-high { color: #dc3545; }
        .violation { background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin: 10px 0; }
        .compliant { background: #d4edda; border-left: 4px solid #28a745; padding: 10px; margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${report.standard.name} Compliance Report</h1>
        <p><strong>Report ID:</strong> ${report.reportId}</p>
        <p><strong>Generated:</strong> ${moment(report.generatedAt).format('YYYY-MM-DD HH:mm:ss')}</p>
        <p><strong>Period:</strong> ${moment(report.reportPeriod.startDate).format('YYYY-MM-DD')} to ${moment(report.reportPeriod.endDate).format('YYYY-MM-DD')}</p>
      </div>

      <div class="summary">
        <h2>Executive Summary</h2>
        <p><strong>Compliance Score:</strong> <span class="risk-${report.executiveSummary.riskLevel.toLowerCase()}">${report.executiveSummary.complianceScore.toFixed(1)}%</span></p>
        <p><strong>Risk Level:</strong> <span class="risk-${report.executiveSummary.riskLevel.toLowerCase()}">${report.executiveSummary.riskLevel}</span></p>
        <p><strong>Audit Entries Reviewed:</strong> ${report.executiveSummary.totalAuditEntries}</p>
        <p><strong>Relevant Entries:</strong> ${report.executiveSummary.relevantEntries}</p>
        <p><strong>Audit Log Integrity:</strong> ${report.executiveSummary.auditIntegrity}</p>
      </div>

      <h2>Compliance Requirements</h2>
      <p><strong>Met Requirements:</strong> ${report.detailedFindings.metRequirements}/${report.detailedFindings.totalRequirements}</p>
      
      ${report.detailedFindings.violations.length > 0 ? `
        <h3>Violations Found</h3>
        ${report.detailedFindings.violations.map(violation => `
          <div class="violation">
            <strong>Requirement:</strong> ${violation.requirement}<br>
            <strong>Severity:</strong> ${violation.severity}<br>
            <strong>Details:</strong> ${violation.details}<br>
            <strong>Recommendations:</strong> ${violation.recommendations.join(', ')}
          </div>
        `).join('')}
      ` : '<div class="compliant">All compliance requirements are met.</div>'}

      <h2>Recommendations</h2>
      <ul>
        ${report.detailedFindings.recommendations.map(rec => `<li>${rec}</li>`).join('')}
      </ul>

      <h2>Audit Trail Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Event Type</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          ${report.auditTrail.eventCategories.map(category => `
            <tr>
              <td>${category.eventType}</td>
              <td>${category.count}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="margin-top: 40px; padding: 20px; background: #f8f9fa; text-align: center;">
        <p><em>This report was generated automatically by the School ERP SaaS Compliance Reporting System</em></p>
        <p><small>Report generated on ${moment(report.generatedAt).format('YYYY-MM-DD HH:mm:ss')}</small></p>
      </div>
    </body>
    </html>
    `;

    return template;
  }

  /**
   * Run automated compliance check
   */
  async runAutomatedComplianceCheck() {
    const results = [];
    
    for (const [standardId, standard] of this.complianceStandards) {
      const schedule = this.reportingSchedules.get(standardId);
      
      if (schedule && schedule.isActive && new Date() >= schedule.nextRun) {
        try {
          // Calculate report period based on frequency
          const endDate = new Date();
          const startDate = this.calculateReportStartDate(schedule.frequency, endDate);
          
          // Generate report
          const report = await this.generateComplianceReport(standardId, startDate, endDate);
          results.push(report);
          
          // Update next run time
          schedule.nextRun = this.calculateNextRunTime(schedule.frequency);
          
        } catch (error) {
          logger.error(`Automated compliance check failed for ${standardId}:`, error);
        }
      }
    }
    
    return results;
  }

  /**
   * Calculate report start date based on frequency
   */
  calculateReportStartDate(frequency, endDate) {
    const end = moment(endDate);
    
    switch (frequency) {
      case 'daily':
        return end.subtract(1, 'day').startOf('day').toDate();
      case 'weekly':
        return end.subtract(1, 'week').startOf('week').toDate();
      case 'monthly':
        return end.subtract(1, 'month').startOf('month').toDate();
      case 'quarterly':
        return end.subtract(3, 'months').startOf('quarter').toDate();
      case 'annually':
        return end.subtract(1, 'year').startOf('year').toDate();
      default:
        return end.subtract(1, 'month').startOf('month').toDate();
    }
  }

  /**
   * Setup cron job for automated reporting
   */
  setupCronJob(standardId, frequency) {
    // In production, this would integrate with a cron job scheduler
    // For now, we'll use a simple interval check
    const checkInterval = 60 * 60 * 1000; // Check every hour
    
    setInterval(async () => {
      try {
        await this.runAutomatedComplianceCheck();
      } catch (error) {
        logger.error('Automated compliance check error:', error);
      }
    }, checkInterval);
  }

  /**
   * Get compliance dashboard data
   */
  async getComplianceDashboard() {
    const dashboard = {
      standards: [],
      overallScore: 0,
      riskLevel: 'LOW',
      lastUpdated: new Date()
    };

    let totalScore = 0;
    let standardCount = 0;

    for (const [standardId, standard] of this.complianceStandards) {
      const lastReport = await this.getLastReport(standardId);
      
      const standardInfo = {
        id: standardId,
        name: standard.name,
        reportingFrequency: standard.reportingFrequency,
        lastReportGenerated: standard.lastReportGenerated,
        complianceScore: lastReport?.executiveSummary?.complianceScore || 0,
        riskLevel: lastReport?.executiveSummary?.riskLevel || 'UNKNOWN',
        status: standard.lastReportGenerated ? 'ACTIVE' : 'PENDING'
      };

      dashboard.standards.push(standardInfo);
      
      if (lastReport) {
        totalScore += lastReport.executiveSummary.complianceScore;
        standardCount++;
      }
    }

    // Calculate overall compliance score
    if (standardCount > 0) {
      dashboard.overallScore = totalScore / standardCount;
      
      if (dashboard.overallScore >= 95) {
        dashboard.riskLevel = 'LOW';
      } else if (dashboard.overallScore >= 80) {
        dashboard.riskLevel = 'MEDIUM';
      } else {
        dashboard.riskLevel = 'HIGH';
      }
    }

    return dashboard;
  }

  /**
   * Get last report for a standard
   */
  async getLastReport(standardId) {
    // This would query your report storage system
    // For now, return null as placeholder
    return null;
  }
}

// Export singleton instance
export const complianceReporter = new ComplianceReporter();
