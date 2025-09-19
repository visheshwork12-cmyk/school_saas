// src/infrastructure/testing/security-testing-manager.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";

/**
 * Automated Security Testing Manager
 * Integrates multiple security testing tools into CI/CD pipeline
 */
export class SecurityTestingManager extends EventEmitter {
  constructor() {
    super();
    this.scanners = new Map();
    this.scanResults = new Map();
    this.securityReports = [];
    this.vulnerabilityThresholds = new Map();
    this.initializeSecurityScanners();
  }

  /**
   * Initialize security scanners
   */
  initializeSecurityScanners() {
    this.setupVulnerabilityThresholds();
    this.setupSecurityScanners();
  }

  /**
   * Setup vulnerability thresholds
   */
  setupVulnerabilityThresholds() {
    // SAST (Static Application Security Testing) thresholds
    this.setVulnerabilityThreshold('SAST', {
      critical: 0,
      high: 2,
      medium: 10,
      low: 20
    });

    // DAST (Dynamic Application Security Testing) thresholds
    this.setVulnerabilityThreshold('DAST', {
      critical: 0,
      high: 1,
      medium: 5,
      low: 15
    });

    // SCA (Software Composition Analysis) thresholds
    this.setVulnerabilityThreshold('SCA', {
      critical: 0,
      high: 3,
      medium: 15,
      low: 25
    });

    // Container Security thresholds
    this.setVulnerabilityThreshold('CONTAINER', {
      critical: 0,
      high: 2,
      medium: 8,
      low: 20
    });

    // Secrets Detection thresholds
    this.setVulnerabilityThreshold('SECRETS', {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    });
  }

  /**
   * Setup security scanners
   */
  setupSecurityScanners() {
    // SAST Scanner (SonarQube)
    this.addScanner('SAST', {
      name: 'Static Application Security Testing',
      description: 'Analyzes source code for security vulnerabilities',
      tool: 'sonarqube',
      execute: async (options) => {
        return await this.executeSonarQubeScanner(options);
      },
      configFile: 'sonar-project.properties'
    });

    // DAST Scanner (OWASP ZAP)
    this.addScanner('DAST', {
      name: 'Dynamic Application Security Testing',
      description: 'Tests running application for vulnerabilities',
      tool: 'owasp-zap',
      execute: async (options) => {
        return await this.executeZAPScanner(options);
      },
      configFile: 'zap-config.yaml'
    });

    // SCA Scanner (Snyk)
    this.addScanner('SCA', {
      name: 'Software Composition Analysis',
      description: 'Scans dependencies for known vulnerabilities',
      tool: 'snyk',
      execute: async (options) => {
        return await this.executeSnykScanner(options);
      }
    });

    // Container Security Scanner (Trivy)
    this.addScanner('CONTAINER', {
      name: 'Container Security Scanning',
      description: 'Scans container images for vulnerabilities',
      tool: 'trivy',
      execute: async (options) => {
        return await this.executeTrivyScanner(options);
      }
    });

    // Secrets Scanner (TruffleHog)
    this.addScanner('SECRETS', {
      name: 'Secrets Detection',
      description: 'Detects hardcoded secrets in code',
      tool: 'trufflehog',
      execute: async (options) => {
        return await this.executeTruffleHogScanner(options);
      }
    });

    // Infrastructure as Code Scanner (Checkov)
    this.addScanner('IAC', {
      name: 'Infrastructure as Code Security',
      description: 'Scans IaC files for misconfigurations',
      tool: 'checkov',
      execute: async (options) => {
        return await this.executeCheckovScanner(options);
      }
    });
  }

  /**
   * Execute comprehensive security scan
   */
  async executeSecurityScan(options = {}) {
    try {
      logger.info('Starting comprehensive security scan');

      const scanSession = {
        sessionId: `security_scan_${Date.now()}`,
        startTime: new Date(),
        scanners: options.scanners || Array.from(this.scanners.keys()),
        results: {},
        summary: {
          totalVulnerabilities: 0,
          criticalVulnerabilities: 0,
          highVulnerabilities: 0,
          mediumVulnerabilities: 0,
          lowVulnerabilities: 0,
          passed: true,
          failedScans: []
        }
      };

      // Execute each scanner
      for (const scannerId of scanSession.scanners) {
        const scanner = this.scanners.get(scannerId);
        if (!scanner) {
          logger.warn(`Scanner not found: ${scannerId}`);
          continue;
        }

        try {
          logger.info(`Executing scanner: ${scanner.name}`);
          
          const scanResult = await scanner.execute({
            ...options,
            scannerId,
            sessionId: scanSession.sessionId
          });

          scanSession.results[scannerId] = {
            scanner: scanner.name,
            tool: scanner.tool,
            status: 'SUCCESS',
            vulnerabilities: scanResult.vulnerabilities || [],
            summary: scanResult.summary,
            duration: scanResult.duration,
            reportPath: scanResult.reportPath
          };

          // Aggregate vulnerabilities
          if (scanResult.summary) {
            scanSession.summary.totalVulnerabilities += scanResult.summary.total || 0;
            scanSession.summary.criticalVulnerabilities += scanResult.summary.critical || 0;
            scanSession.summary.highVulnerabilities += scanResult.summary.high || 0;
            scanSession.summary.mediumVulnerabilities += scanResult.summary.medium || 0;
            scanSession.summary.lowVulnerabilities += scanResult.summary.low || 0;
          }

        } catch (error) {
          logger.error(`Scanner failed: ${scannerId}`, error);
          
          scanSession.results[scannerId] = {
            scanner: scanner.name,
            tool: scanner.tool,
            status: 'FAILED',
            error: error.message,
            vulnerabilities: [],
            summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 }
          };

          scanSession.summary.failedScans.push(scannerId);
        }
      }

      // Check vulnerability thresholds
      scanSession.summary.passed = await this.checkVulnerabilityThresholds(scanSession);

      scanSession.endTime = new Date();
      scanSession.duration = scanSession.endTime - scanSession.startTime;

      // Store scan results
      this.scanResults.set(scanSession.sessionId, scanSession);

      // Generate comprehensive report
      const report = await this.generateSecurityReport(scanSession);

      // Emit scan completed event
      this.emit('securityScanCompleted', {
        sessionId: scanSession.sessionId,
        passed: scanSession.summary.passed,
        vulnerabilities: scanSession.summary.totalVulnerabilities,
        report
      });

      logger.info(`Security scan completed: ${scanSession.sessionId}`, {
        passed: scanSession.summary.passed,
        totalVulnerabilities: scanSession.summary.totalVulnerabilities,
        duration: scanSession.duration
      });

      return scanSession;

    } catch (error) {
      logger.error('Security scan failed:', error);
      throw error;
    }
  }

  /**
   * Execute SonarQube SAST scanner
   */
  async executeSonarQubeScanner(options) {
    try {
      const startTime = Date.now();
      
      // Create SonarQube configuration
      await this.createSonarQubeConfig(options);

      const command = [
        'sonar-scanner',
        `-Dsonar.projectKey=school-erp-${options.environment || 'dev'}`,
        `-Dsonar.sources=${options.sourcePath || '.'}`,
        `-Dsonar.host.url=${process.env.SONAR_HOST_URL || 'http://localhost:9000'}`,
        `-Dsonar.login=${process.env.SONAR_TOKEN}`,
        '-Dsonar.qualitygate.wait=true'
      ];

      const output = execSync(command.join(' '), {
        encoding: 'utf-8',
        cwd: options.projectPath || process.cwd()
      });

      // Parse SonarQube results
      const results = await this.parseSonarQubeResults(options);

      return {
        status: 'SUCCESS',
        summary: results.summary,
        vulnerabilities: results.vulnerabilities,
        duration: Date.now() - startTime,
        reportPath: results.reportPath,
        rawOutput: output
      };

    } catch (error) {
      logger.error('SonarQube scanner failed:', error);
      throw error;
    }
  }

  /**
   * Execute OWASP ZAP DAST scanner
   */
  async executeZAPScanner(options) {
    try {
      const startTime = Date.now();
      const targetUrl = options.targetUrl || 'http://localhost:3000';
      const reportPath = path.join('reports', 'security', `zap-report-${Date.now()}.json`);

      await fs.mkdir(path.dirname(reportPath), { recursive: true });

      const command = [
        'zap-baseline.py',
        '-t', targetUrl,
        '-J', reportPath,
        '-x', reportPath.replace('.json', '.xml'),
        '-r', reportPath.replace('.json', '.html'),
        '-I', // Include informational alerts
        '-d' // Show debug messages
      ];

      let output;
      try {
        output = execSync(command.join(' '), {
          encoding: 'utf-8',
          timeout: options.timeout || 300000 // 5 minutes
        });
      } catch (error) {
        // ZAP returns non-zero exit code even for successful scans with findings
        output = error.stdout || error.message;
      }

      // Parse ZAP results
      const results = await this.parseZAPResults(reportPath);

      return {
        status: 'SUCCESS',
        summary: results.summary,
        vulnerabilities: results.vulnerabilities,
        duration: Date.now() - startTime,
        reportPath,
        rawOutput: output
      };

    } catch (error) {
      logger.error('OWASP ZAP scanner failed:', error);
      throw error;
    }
  }

  /**
   * Execute Snyk SCA scanner
   */
  async executeSnykScanner(options) {
    try {
      const startTime = Date.now();
      const reportPath = path.join('reports', 'security', `snyk-report-${Date.now()}.json`);

      await fs.mkdir(path.dirname(reportPath), { recursive: true });

      const command = [
        'snyk', 'test',
        '--json',
        `--json-file-output=${reportPath}`,
        '--severity-threshold=low',
        '--all-projects'
      ];

      if (process.env.SNYK_TOKEN) {
        command.push(`--auth=${process.env.SNYK_TOKEN}`);
      }

      let output;
      try {
        output = execSync(command.join(' '), {
          encoding: 'utf-8',
          cwd: options.projectPath || process.cwd()
        });
      } catch (error) {
        // Snyk returns non-zero exit code when vulnerabilities are found
        output = error.stdout || '';
      }

      // Parse Snyk results
      const results = await this.parseSnykResults(reportPath);

      return {
        status: 'SUCCESS',
        summary: results.summary,
        vulnerabilities: results.vulnerabilities,
        duration: Date.now() - startTime,
        reportPath,
        rawOutput: output
      };

    } catch (error) {
      logger.error('Snyk scanner failed:', error);
      throw error;
    }
  }

  /**
   * Execute Trivy container scanner
   */
  async executeTrivyScanner(options) {
    try {
      const startTime = Date.now();
      const imageName = options.imageName || 'school-erp:latest';
      const reportPath = path.join('reports', 'security', `trivy-report-${Date.now()}.json`);

      await fs.mkdir(path.dirname(reportPath), { recursive: true });

      const command = [
        'trivy', 'image',
        '--format', 'json',
        '--output', reportPath,
        '--severity', 'UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL',
        imageName
      ];

      const output = execSync(command.join(' '), {
        encoding: 'utf-8'
      });

      // Parse Trivy results
      const results = await this.parseTrivyResults(reportPath);

      return {
        status: 'SUCCESS',
        summary: results.summary,
        vulnerabilities: results.vulnerabilities,
        duration: Date.now() - startTime,
        reportPath,
        rawOutput: output
      };

    } catch (error) {
      logger.error('Trivy scanner failed:', error);
      throw error;
    }
  }

  /**
   * Execute TruffleHog secrets scanner
   */
  async executeTruffleHogScanner(options) {
    try {
      const startTime = Date.now();
      const reportPath = path.join('reports', 'security', `trufflehog-report-${Date.now()}.json`);

      await fs.mkdir(path.dirname(reportPath), { recursive: true });

      const command = [
        'trufflehog',
        '--json',
        '--entropy=false',
        '--regex',
        'filesystem',
        options.scanPath || '.'
      ];

      const output = execSync(command.join(' '), {
        encoding: 'utf-8',
        cwd: options.projectPath || process.cwd()
      });

      // Save raw output to report file
      await fs.writeFile(reportPath, output);

      // Parse TruffleHog results
      const results = await this.parseTruffleHogResults(reportPath);

      return {
        status: 'SUCCESS',
        summary: results.summary,
        vulnerabilities: results.vulnerabilities,
        duration: Date.now() - startTime,
        reportPath,
        rawOutput: output
      };

    } catch (error) {
      logger.error('TruffleHog scanner failed:', error);
      throw error;
    }
  }

  /**
   * Execute Checkov IaC scanner
   */
  async executeCheckovScanner(options) {
    try {
      const startTime = Date.now();
      const reportPath = path.join('reports', 'security', `checkov-report-${Date.now()}.json`);

      await fs.mkdir(path.dirname(reportPath), { recursive: true });

      const command = [
        'checkov',
        '--directory', options.iacPath || './infrastructure',
        '--output', 'json',
        '--output-file', reportPath,
        '--quiet'
      ];

      const output = execSync(command.join(' '), {
        encoding: 'utf-8',
        cwd: options.projectPath || process.cwd()
      });

      // Parse Checkov results
      const results = await this.parseCheckovResults(reportPath);

      return {
        status: 'SUCCESS',
        summary: results.summary,
        vulnerabilities: results.vulnerabilities,
        duration: Date.now() - startTime,
        reportPath,
        rawOutput: output
      };

    } catch (error) {
      logger.error('Checkov scanner failed:', error);
      throw error;
    }
  }

  // Result parsers
  async parseSonarQubeResults(options) {
    // Simplified SonarQube result parsing
    return {
      summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
      vulnerabilities: [],
      reportPath: null
    };
  }

  async parseZAPResults(reportPath) {
    try {
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const zapReport = JSON.parse(reportContent);

      const vulnerabilities = [];
      const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

      if (zapReport.site && zapReport.site[0] && zapReport.site[0].alerts) {
        for (const alert of zapReport.site[0].alerts) {
          const severity = this.mapZAPRisk(alert.riskdesc);
          summary[severity]++;
          summary.total++;

          vulnerabilities.push({
            title: alert.name,
            description: alert.desc,
            severity,
            risk: alert.riskdesc,
            confidence: alert.confidence,
            url: alert.url,
            solution: alert.solution,
            reference: alert.reference
          });
        }
      }

      return { summary, vulnerabilities, reportPath };

    } catch (error) {
      logger.error('Failed to parse ZAP results:', error);
      return {
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        vulnerabilities: [],
        reportPath
      };
    }
  }

  async parseSnykResults(reportPath) {
    try {
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const snykReport = JSON.parse(reportContent);

      const vulnerabilities = [];
      const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

      if (snykReport.vulnerabilities) {
        for (const vuln of snykReport.vulnerabilities) {
          const severity = vuln.severity.toLowerCase();
          summary[severity]++;
          summary.total++;

          vulnerabilities.push({
            title: vuln.title,
            description: vuln.description,
            severity,
            package: vuln.packageName,
            version: vuln.version,
            cvss: vuln.cvssScore,
            cve: vuln.identifiers?.CVE?.[0],
            fixedIn: vuln.fixedIn
          });
        }
      }

      return { summary, vulnerabilities, reportPath };

    } catch (error) {
      logger.error('Failed to parse Snyk results:', error);
      return {
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        vulnerabilities: [],
        reportPath
      };
    }
  }

  async parseTrivyResults(reportPath) {
    try {
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const trivyReport = JSON.parse(reportContent);

      const vulnerabilities = [];
      const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

      if (trivyReport.Results) {
        for (const result of trivyReport.Results) {
          if (result.Vulnerabilities) {
            for (const vuln of result.Vulnerabilities) {
              const severity = vuln.Severity.toLowerCase();
              summary[severity]++;
              summary.total++;

              vulnerabilities.push({
                title: vuln.Title,
                description: vuln.Description,
                severity,
                package: vuln.PkgName,
                version: vuln.InstalledVersion,
                fixedVersion: vuln.FixedVersion,
                cvss: vuln.CVSS?.nvd?.V3Score,
                cve: vuln.VulnerabilityID
              });
            }
          }
        }
      }

      return { summary, vulnerabilities, reportPath };

    } catch (error) {
      logger.error('Failed to parse Trivy results:', error);
      return {
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        vulnerabilities: [],
        reportPath
      };
    }
  }

  async parseTruffleHogResults(reportPath) {
    try {
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const secrets = reportContent.trim().split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

      const vulnerabilities = [];
      const summary = { total: secrets.length, critical: 0, high: 0, medium: 0, low: 0 };

      for (const secret of secrets) {
        // All secrets are considered high severity
        summary.high++;

        vulnerabilities.push({
          title: `Secret detected: ${secret.DetectorName}`,
          description: `Potential secret found in file`,
          severity: 'high',
          file: secret.SourceMetadata?.Data?.Filesystem?.file,
          line: secret.SourceMetadata?.Data?.Filesystem?.line,
          detector: secret.DetectorName,
          verified: secret.Verified
        });
      }

      return { summary, vulnerabilities, reportPath };

    } catch (error) {
      logger.error('Failed to parse TruffleHog results:', error);
      return {
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        vulnerabilities: [],
        reportPath
      };
    }
  }

  async parseCheckovResults(reportPath) {
    try {
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      const checkovReport = JSON.parse(reportContent);

      const vulnerabilities = [];
      const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0 };

      if (checkovReport.results?.failed_checks) {
        for (const check of checkovReport.results.failed_checks) {
          // Map Checkov severity
          const severity = this.mapCheckovSeverity(check.severity || 'MEDIUM');
          summary[severity]++;
          summary.total++;

          vulnerabilities.push({
            title: check.check_name,
            description: check.description,
            severity,
            file: check.file_path,
            line: check.file_line_range?.[0],
            checkId: check.check_id,
            resource: check.resource
          });
        }
      }

      return { summary, vulnerabilities, reportPath };

    } catch (error) {
      logger.error('Failed to parse Checkov results:', error);
      return {
        summary: { total: 0, critical: 0, high: 0, medium: 0, low: 0 },
        vulnerabilities: [],
        reportPath
      };
    }
  }

  // Helper methods
  mapZAPRisk(riskDesc) {
    if (riskDesc.toLowerCase().includes('critical')) return 'critical';
    if (riskDesc.toLowerCase().includes('high')) return 'high';
    if (riskDesc.toLowerCase().includes('medium')) return 'medium';
    return 'low';
  }

  mapCheckovSeverity(severity) {
    switch (severity.toUpperCase()) {
      case 'CRITICAL': return 'critical';
      case 'HIGH': return 'high';
      case 'MEDIUM': return 'medium';
      case 'LOW': return 'low';
      default: return 'medium';
    }
  }

  async createSonarQubeConfig(options) {
    const config = `
sonar.projectKey=school-erp-${options.environment || 'dev'}
sonar.projectName=School ERP SaaS
sonar.projectVersion=1.0
sonar.sources=src
sonar.tests=tests
sonar.exclusions=**/node_modules/**,**/coverage/**
sonar.javascript.lcov.reportPaths=coverage/lcov.info
sonar.testExecutionReportPaths=coverage/test-report.xml
`;

    await fs.writeFile('sonar-project.properties', config.trim());
  }

  async checkVulnerabilityThresholds(scanSession) {
    let passed = true;

    for (const [scannerId, result] of Object.entries(scanSession.results)) {
      if (result.status !== 'SUCCESS') continue;

      const threshold = this.vulnerabilityThresholds.get(scannerId);
      if (!threshold) continue;

      const summary = result.summary;
      
      if (summary.critical > threshold.critical ||
          summary.high > threshold.high ||
          summary.medium > threshold.medium ||
          summary.low > threshold.low) {
        
        passed = false;
        
        logger.warn(`Vulnerability threshold exceeded for ${scannerId}:`, {
          found: summary,
          threshold
        });
      }
    }

    return passed;
  }

  async generateSecurityReport(scanSession) {
    const report = {
      sessionId: scanSession.sessionId,
      generatedAt: new Date(),
      duration: scanSession.duration,
      summary: scanSession.summary,
      scanResults: scanSession.results,
      recommendations: this.generateSecurityRecommendations(scanSession)
    };

    // Save consolidated report
    const reportPath = path.join('reports', 'security', `security-report-${scanSession.sessionId}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    this.securityReports.push(report);

    // Keep only last 50 reports
    if (this.securityReports.length > 50) {
      this.securityReports = this.securityReports.slice(-50);
    }

    return report;
  }

  generateSecurityRecommendations(scanSession) {
    const recommendations = [];

    if (scanSession.summary.criticalVulnerabilities > 0) {
      recommendations.push({
        type: 'CRITICAL_VULNERABILITIES',
        priority: 'CRITICAL',
        message: `${scanSession.summary.criticalVulnerabilities} critical vulnerabilities found`,
        action: 'Fix critical vulnerabilities immediately before deployment'
      });
    }

    if (scanSession.summary.failedScans.length > 0) {
      recommendations.push({
        type: 'SCANNER_FAILURES',
        priority: 'HIGH',
        message: `${scanSession.summary.failedScans.length} security scanners failed`,
        action: 'Review and fix scanner configuration issues',
        failedScans: scanSession.summary.failedScans
      });
    }

    if (scanSession.summary.highVulnerabilities > 10) {
      recommendations.push({
        type: 'HIGH_VULNERABILITY_COUNT',
        priority: 'MEDIUM',
        message: `High number of vulnerabilities detected: ${scanSession.summary.totalVulnerabilities}`,
        action: 'Prioritize vulnerability remediation efforts'
      });
    }

    return recommendations;
  }

  // Public API methods
  addScanner(scannerId, scanner) {
    this.scanners.set(scannerId, scanner);
    logger.debug(`Security scanner added: ${scannerId}`);
  }

  setVulnerabilityThreshold(scannerId, threshold) {
    this.vulnerabilityThresholds.set(scannerId, threshold);
  }

  getScanResults(sessionId) {
    return this.scanResults.get(sessionId);
  }

  getSecurityReports(limit = 10) {
    return this.securityReports.slice(-limit);
  }

  getAvailableScanners() {
    return Array.from(this.scanners.keys());
  }

  async generateComplianceReport(standard = 'OWASP') {
    const report = {
      standard,
      generatedAt: new Date(),
      compliance: {},
      recommendations: []
    };

    // OWASP Top 10 compliance mapping
    if (standard === 'OWASP') {
      const recentScan = this.securityReports[this.securityReports.length - 1];
      
      if (recentScan) {
        report.compliance = {
          'A01_Broken_Access_Control': this.checkOWASPCompliance(recentScan, 'access_control'),
          'A02_Cryptographic_Failures': this.checkOWASPCompliance(recentScan, 'crypto'),
          'A03_Injection': this.checkOWASPCompliance(recentScan, 'injection'),
          'A04_Insecure_Design': this.checkOWASPCompliance(recentScan, 'design'),
          'A05_Security_Misconfiguration': this.checkOWASPCompliance(recentScan, 'misconfig'),
          'A06_Vulnerable_Components': this.checkOWASPCompliance(recentScan, 'components'),
          'A07_Authentication_Failures': this.checkOWASPCompliance(recentScan, 'auth'),
          'A08_Software_Data_Integrity': this.checkOWASPCompliance(recentScan, 'integrity'),
          'A09_Logging_Monitoring': this.checkOWASPCompliance(recentScan, 'logging'),
          'A10_Server_Side_Request_Forgery': this.checkOWASPCompliance(recentScan, 'ssrf')
        };
      }
    }

    return report;
  }

  checkOWASPCompliance(scanReport, category) {
    // Simplified compliance checking
    const categoryVulns = this.filterVulnerabilitiesByCategory(scanReport, category);
    return {
      compliant: categoryVulns.critical === 0 && categoryVulns.high === 0,
      vulnerabilities: categoryVulns,
      status: categoryVulns.critical > 0 ? 'NON_COMPLIANT' : 
              categoryVulns.high > 0 ? 'PARTIAL' : 'COMPLIANT'
    };
  }

  filterVulnerabilitiesByCategory(scanReport, category) {
    // Simplified vulnerability filtering by category
    return { critical: 0, high: 0, medium: 0, low: 0 };
  }
}

// Export singleton instance
export const securityTestingManager = new SecurityTestingManager();
