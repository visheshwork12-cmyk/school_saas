// scripts/docs/validate-documentation.js
import fs from 'fs/promises';
import path from 'path';
import { logger } from '#utils/core/logger.js';
import { AuditService } from '#core/audit/services/audit-log.service.js';
import { BusinessException } from '#shared/exceptions/business.exception.js';
import  config from '#shared/config/index.js';

/**
 * @typedef {Object} ValidationResult
 * @property {string} status - Validation status ('valid' | 'incomplete' | 'missing')
 * @property {string[]} issues - List of issues found
 * @property {number} [wordCount] - Word count of the file
 */

/**
 * @description Validates Phase 2 documentation
 */
export class DocumentationValidator {
  /**
   * @description Validates all Phase 2 documentation files
   * @returns {Promise<string>} Validation report
   */
  async validatePhase2() {
    try {
      const results = {
        systemDesign: await this.validateSystemDesign(),
        databaseSchema: await this.validateDatabaseSchema(),
        multiTenancy: await this.validateMultiTenancy(),
        scalability: await this.validateScalability(),
        securityModel: await this.validateSecurityModel(),
        subscriptionModel: await this.validateSubscriptionModel(),
      };

      const report = await this.generateReport(results);
      await AuditService.log('DOCUMENTATION_VALIDATION', {
        action: 'validate_phase2',
        results: Object.fromEntries(
          Object.entries(results).map(([key, result]) => [key, result.status])
        ),
      });
      return report;
    } catch (error) {
      logger.error(`Documentation validation failed: ${error.message}`, { error });
      throw new BusinessException('Documentation validation failed', 'DOC_VALIDATION_FAILED', 500, error);
    }
  }

  /**
   * @description Gets the documentation directory path with fallback
   * @returns {string} Documentation directory path
   */
  getDocsPath() {
    return config.paths?.docs || 'docs';
  }

  /**
   * @description Validates system-design.md
   * @returns {Promise<ValidationResult>}
   */
  async validateSystemDesign() {
    const filePath = path.join(this.getDocsPath(), 'architecture/system-design.md');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const issues = [];

      const requiredSections = [
        'High-Level Architecture',
        'Technology Stack',
        'System Components',
        'API Design',
        'Security Architecture',
        'Performance & Scalability',
        'Deployment Architecture',
      ];

      requiredSections.forEach((section) => {
        if (!content.includes(section)) {
          issues.push(`Missing section: ${section}`);
        }
      });

      if (!content.includes('```mermaid')) {
        issues.push('Missing Mermaid diagram');
      }

      return {
        status: issues.length === 0 ? 'valid' : 'incomplete',
        issues,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      logger.warn(`System design validation failed: ${error.message}`, { file: filePath });
      return { status: 'missing', issues: [`File not found: ${filePath}`] };
    }
  }

  /**
   * @description Validates database-schema.md
   * @returns {Promise<ValidationResult>}
   */
  async validateDatabaseSchema() {
    const filePath = path.join(this.getDocsPath(), 'architecture/database-schema.md');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const issues = [];

      const coreCollections = [
        'Organizations',
        'Schools',
        'Users',
        'Students',
        'Classes',
        'Subjects',
        'Attendance',
        'Exams',
        'ExamResults',
        'FeeStructures',
        'FeeTransactions',
      ];

      coreCollections.forEach((collection) => {
        if (!content.includes(collection)) {
          issues.push(`Missing collection: ${collection}`);
        }
      });

      if (!content.includes('index(')) {
        issues.push('Missing database indexes documentation');
      }

      if (!content.includes('```mermaid') || !content.includes('erDiagram')) {
        issues.push('Missing ER diagram');
      }

      return {
        status: issues.length === 0 ? 'valid' : 'incomplete',
        issues,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      logger.warn(`Database schema validation failed: ${error.message}`, { file: filePath });
      return { status: 'missing', issues: [`File not found: ${filePath}`] };
    }
  }

  /**
   * @description Validates multi-tenancy.md
   * @returns {Promise<ValidationResult>}
   */
  async validateMultiTenancy() {
    const filePath = path.join(this.getDocsPath(), 'architecture/multi-tenancy.md');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const issues = [];

      const requiredSections = [
        'Multi-Tenancy Overview',
        'Tenant Identification & Routing',
        'Data Isolation Strategies',
        'Resource Management & Scaling',
      ];

      requiredSections.forEach((section) => {
        if (!content.includes(section)) {
          issues.push(`Missing section: ${section}`);
        }
      });

      if (!content.includes('tenantId')) {
        issues.push('Missing tenantId implementation details');
      }

      return {
        status: issues.length === 0 ? 'valid' : 'incomplete',
        issues,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      logger.warn(`Multi-tenancy validation failed: ${error.message}`, { file: filePath });
      return { status: 'missing', issues: [`File not found: ${filePath}`] };
    }
  }

  /**
   * @description Validates scalability.md
   * @returns {Promise<ValidationResult>}
   */
  async validateScalability() {
    const filePath = path.join(this.getDocsPath(), 'architecture/scalability.md');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const issues = [];

      const requiredSections = [
        'Scalability Strategy Overview',
        'Application Scaling',
        'Database Scaling',
        'Caching Strategy',
        'Containerization & Deployment',
      ];

      requiredSections.forEach((section) => {
        if (!content.includes(section)) {
          issues.push(`Missing section: ${section}`);
        }
      });

      if (!content.includes('```yaml') || !content.includes('Deployment')) {
        issues.push('Missing Kubernetes/Docker configuration');
      }

      return {
        status: issues.length === 0 ? 'valid' : 'incomplete',
        issues,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      logger.warn(`Scalability validation failed: ${error.message}`, { file: filePath });
      return { status: 'missing', issues: [`File not found: ${filePath}`] };
    }
  }

  /**
   * @description Validates security-model.md
   * @returns {Promise<ValidationResult>}
   */
  async validateSecurityModel() {
    const filePath = path.join(this.getDocsPath(), 'architecture/security-model.md');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const issues = [];

      const requiredSections = [
        'Authentication',
        'Authorization',
        'Data Security',
        'Network Security',
        'Audit Logging',
      ];

      requiredSections.forEach((section) => {
        if (!content.includes(section)) {
          issues.push(`Missing section: ${section}`);
        }
      });

      if (!content.includes('JWT')) {
        issues.push('Missing JWT authentication details');
      }

      return {
        status: issues.length === 0 ? 'valid' : 'incomplete',
        issues,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      logger.warn(`Security model validation failed: ${error.message}`, { file: filePath });
      return { status: 'missing', issues: [`File not found: ${filePath}`] };
    }
  }

  /**
   * @description Validates subscription-model.md
   * @returns {Promise<ValidationResult>}
   */
  async validateSubscriptionModel() {
    const filePath = path.join(this.getDocsPath(), 'architecture/subscription-model.md');
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const issues = [];

      const requiredSections = [
        'Subscription Plans',
        'Feature Access Control',
        'Billing Integration',
        'Usage Limits',
      ];

      requiredSections.forEach((section) => {
        if (!content.includes(section)) {
          issues.push(`Missing section: ${section}`);
        }
      });

      if (!content.includes('Stripe')) {
        issues.push('Missing billing integration details');
      }

      return {
        status: issues.length === 0 ? 'valid' : 'incomplete',
        issues,
        wordCount: content.split(/\s+/).length,
      };
    } catch (error) {
      logger.warn(`Subscription model validation failed: ${error.message}`, { file: filePath });
      return { status: 'missing', issues: [`File not found: ${filePath}`] };
    }
  }

  /**
   * @description Generates a validation report
   * @param {Object.<string, ValidationResult>} results - Validation results
   * @returns {Promise<string>} Markdown report
   */
  async generateReport(results) {
    let report = `
# Phase 2 Documentation Validation Report
Generated: ${new Date().toISOString()}

## Overall Status
`;

    for (const [component, result] of Object.entries(results)) {
      const status = result.status === 'valid' ? '✅' :
                     result.status === 'incomplete' ? '⚠️' : '❌';
      report += `- ${component}: ${status} ${result.status}\n`;

      if (result.issues?.length > 0) {
        report += `  Issues:\n`;
        result.issues.forEach((issue) => {
          report += `    - ${issue}\n`;
        });
      }
      if (result.wordCount) {
        report += `  Word Count: ${result.wordCount}\n`;
      }
    }

    try {
      const reportPath = path.join(this.getDocsPath(), 'validation-report.md');
      await fs.writeFile(reportPath, report);
      logger.info('Validation report generated successfully', { file: reportPath });
    } catch (error) {
      logger.error(`Failed to write validation report: ${error.message}`, { file: reportPath });
    }

    return report;
  }
}

// Usage
(async () => {
  try {
    const validator = new DocumentationValidator();
    const report = await validator.validatePhase2();
    console.log(report);
  } catch (error) {
    console.error(`Validation failed: ${error.message}`);
    process.exit(1);
  }
})();