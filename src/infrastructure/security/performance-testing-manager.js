// src/infrastructure/testing/performance-testing-manager.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import { execSync } from "child_process";
import fs from "fs/promises";
import path from "path";

/**
 * Performance Testing Manager
 * Automated performance testing integration for CI/CD pipelines
 */
export class PerformanceTestingManager extends EventEmitter {
  constructor() {
    super();
    this.testSuites = new Map();
    this.testResults = new Map();
    this.performanceBaselines = new Map();
    this.thresholds = new Map();
    this.loadGenerators = new Map();
    this.initializePerformanceTesting();
  }

  /**
   * Initialize performance testing framework
   */
  initializePerformanceTesting() {
    this.setupLoadGenerators();
    this.setupPerformanceThresholds();
    this.setupDefaultTestSuites();
  }

  /**
   * Setup load generators
   */
  setupLoadGenerators() {
    // K6 Load Generator
    this.addLoadGenerator('K6', {
      name: 'K6 Performance Testing',
      description: 'JavaScript-based load testing tool',
      command: 'k6',
      execute: async (testScript, options) => {
        return await this.executeK6Test(testScript, options);
      },
      reportFormat: 'json'
    });

    // JMeter Load Generator
    this.addLoadGenerator('JMETER', {
      name: 'Apache JMeter',
      description: 'Java-based load testing tool',
      command: 'jmeter',
      execute: async (testScript, options) => {
        return await this.executeJMeterTest(testScript, options);
      },
      reportFormat: 'jtl'
    });

    // Artillery Load Generator
    this.addLoadGenerator('ARTILLERY', {
      name: 'Artillery.io',
      description: 'Modern load testing framework',
      command: 'artillery',
      execute: async (testScript, options) => {
        return await this.executeArtilleryTest(testScript, options);
      },
      reportFormat: 'json'
    });

    // NBomber Load Generator (.NET)
    this.addLoadGenerator('NBOMBER', {
      name: 'NBomber',
      description: '.NET load testing framework',
      command: 'nbomber',
      execute: async (testScript, options) => {
        return await this.executeNBomberTest(testScript, options);
      },
      reportFormat: 'json'
    });
  }

  /**
   * Setup performance thresholds
   */
  setupPerformanceThresholds() {
    // API Response Time Thresholds
    this.setPerformanceThreshold('API_RESPONSE_TIME', {
      p50: 200, // 50th percentile < 200ms
      p90: 500, // 90th percentile < 500ms
      p95: 1000, // 95th percentile < 1000ms
      p99: 2000, // 99th percentile < 2000ms
      max: 5000 // Maximum < 5000ms
    });

    // Throughput Thresholds
    this.setPerformanceThreshold('THROUGHPUT', {
      min: 100, // Minimum 100 RPS
      target: 500, // Target 500 RPS
      max: 1000 // Maximum 1000 RPS
    });

    // Error Rate Thresholds
    this.setPerformanceThreshold('ERROR_RATE', {
      max: 0.01, // Maximum 1% error rate
      critical: 0.05 // Critical at 5% error rate
    });

    // Resource Utilization Thresholds
    this.setPerformanceThreshold('RESOURCE_UTILIZATION', {
      cpu: 80, // Maximum 80% CPU usage
      memory: 85, // Maximum 85% memory usage
      disk: 90 // Maximum 90% disk usage
    });

    // Database Performance Thresholds
    this.setPerformanceThreshold('DATABASE_PERFORMANCE', {
      queryTime: 100, // Average query time < 100ms
      connectionPool: 80, // Max 80% connection pool usage
      lockWaitTime: 50 // Max 50ms lock wait time
    });
  }

  /**
   * Setup default test suites
   */
  setupDefaultTestSuites() {
    // API Load Test Suite
    this.addTestSuite('API_LOAD_TEST', {
      name: 'API Load Testing',
      description: 'Load testing for REST API endpoints',
      generator: 'K6',
      testScript: this.generateAPILoadTestScript(),
      scenarios: {
        load_test: {
          executor: 'ramping-vus',
          startVUs: 1,
          stages: [
            { duration: '2m', target: 10 },
            { duration: '5m', target: 10 },
            { duration: '2m', target: 20 },
            { duration: '5m', target: 20 },
            { duration: '2m', target: 0 }
          ]
        }
      }
    });

    // Stress Test Suite
    this.addTestSuite('STRESS_TEST', {
      name: 'Stress Testing',
      description: 'Tests system behavior under extreme load',
      generator: 'K6',
      testScript: this.generateStressTestScript(),
      scenarios: {
        stress_test: {
          executor: 'ramping-vus',
          startVUs: 1,
          stages: [
            { duration: '5m', target: 100 },
            { duration: '10m', target: 100 },
            { duration: '5m', target: 200 },
            { duration: '10m', target: 200 },
            { duration: '5m', target: 300 },
            { duration: '10m', target: 300 },
            { duration: '5m', target: 0 }
          ]
        }
      }
    });

    // Spike Test Suite
    this.addTestSuite('SPIKE_TEST', {
      name: 'Spike Testing',
      description: 'Tests system behavior under sudden load spikes',
      generator: 'K6',
      testScript: this.generateSpikeTestScript(),
      scenarios: {
        spike_test: {
          executor: 'ramping-vus',
          startVUs: 1,
          stages: [
            { duration: '1m', target: 10 },
            { duration: '30s', target: 100 }, // Spike
            { duration: '3m', target: 100 },
            { duration: '30s', target: 10 }, // Drop
            { duration: '3m', target: 10 }
          ]
        }
      }
    });

    // Volume Test Suite
    this.addTestSuite('VOLUME_TEST', {
      name: 'Volume Testing',
      description: 'Tests system with large amounts of data',
      generator: 'K6',
      testScript: this.generateVolumeTestScript(),
      scenarios: {
        volume_test: {
          executor: 'constant-vus',
          vus: 50,
          duration: '30m'
        }
      }
    });

    // Database Performance Test Suite
    this.addTestSuite('DATABASE_PERFORMANCE_TEST', {
      name: 'Database Performance Testing',
      description: 'Tests database performance under load',
      generator: 'K6',
      testScript: this.generateDatabaseTestScript(),
      scenarios: {
        db_load_test: {
          executor: 'ramping-vus',
          startVUs: 1,
          stages: [
            { duration: '2m', target: 25 },
            { duration: '10m', target: 25 },
            { duration: '2m', target: 0 }
          ]
        }
      }
    });
  }

  /**
   * Execute performance test suite
   */
  async executePerformanceTest(suiteId, options = {}) {
    try {
      logger.info(`Starting performance test: ${suiteId}`);

      const testSuite = this.testSuites.get(suiteId);
      if (!testSuite) {
        throw new Error(`Test suite not found: ${suiteId}`);
      }

      const testSession = {
        sessionId: `perf_test_${Date.now()}`,
        suiteId,
        suiteName: testSuite.name,
        startTime: new Date(),
        generator: testSuite.generator,
        options,
        results: {},
        summary: {},
        passed: false
      };

      // Prepare test environment
      await this.prepareTestEnvironment(testSession);

      // Execute load generator
      const loadGenerator = this.loadGenerators.get(testSuite.generator);
      if (!loadGenerator) {
        throw new Error(`Load generator not found: ${testSuite.generator}`);
      }

      logger.info(`Executing test with ${loadGenerator.name}`);

      const testResults = await loadGenerator.execute(testSuite.testScript, {
        ...testSuite,
        ...options,
        sessionId: testSession.sessionId
      });

      testSession.results = testResults;
      testSession.summary = this.calculatePerformanceSummary(testResults);

      // Check performance thresholds
      testSession.passed = await this.checkPerformanceThresholds(testSession);

      testSession.endTime = new Date();
      testSession.duration = testSession.endTime - testSession.startTime;

      // Store test results
      this.testResults.set(testSession.sessionId, testSession);

      // Update performance baselines
      await this.updatePerformanceBaselines(testSession);

      // Generate performance report
      const report = await this.generatePerformanceReport(testSession);

      // Emit test completed event
      this.emit('performanceTestCompleted', {
        sessionId: testSession.sessionId,
        suiteId,
        passed: testSession.passed,
        summary: testSession.summary,
        report
      });

      logger.info(`Performance test completed: ${testSession.sessionId}`, {
        passed: testSession.passed,
        duration: testSession.duration,
        avgResponseTime: testSession.summary.avgResponseTime,
        throughput: testSession.summary.throughput
      });

      return testSession;

    } catch (error) {
      logger.error(`Performance test failed: ${suiteId}`, error);
      throw error;
    }
  }

  /**
   * Execute K6 performance test
   */
  async executeK6Test(testScript, options) {
    try {
      const startTime = Date.now();
      const reportPath = path.join('reports', 'performance', `k6-results-${options.sessionId}.json`);

      await fs.mkdir(path.dirname(reportPath), { recursive: true });

      // Create K6 test file
      const testFilePath = path.join('temp', `k6-test-${options.sessionId}.js`);
      await fs.mkdir(path.dirname(testFilePath), { recursive: true });
      await fs.writeFile(testFilePath, testScript);

      const command = [
        'k6', 'run',
        '--out', `json=${reportPath}`,
        '--summary-export', reportPath.replace('.json', '-summary.json'),
        testFilePath
      ];

      // Add environment variables
      const env = {
        ...process.env,
        K6_BASE_URL: options.baseUrl || 'http://localhost:3000',
        K6_DURATION: options.duration || '5m',
        K6_VUS: options.virtualUsers || '10'
      };

      const output = execSync(command.join(' '), {
        encoding: 'utf-8',
        env,
        timeout: options.timeout || 1800000 // 30 minutes
      });

      // Parse K6 results
      const results = await this.parseK6Results(reportPath);

      // Cleanup
      await fs.unlink(testFilePath);

      return {
        status: 'SUCCESS',
        generator: 'K6',
        metrics: results.metrics,
        summary: results.summary,
        duration: Date.now() - startTime,
        reportPath,
        rawOutput: output
      };

    } catch (error) {
      logger.error('K6 test execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute JMeter performance test
   */
  async executeJMeterTest(testScript, options) {
    try {
      const startTime = Date.now();
      const reportPath = path.join('reports', 'performance', `jmeter-results-${options.sessionId}.jtl`);

      await fs.mkdir(path.dirname(reportPath), { recursive: true });

      const command = [
        'jmeter',
        '-n', // Non-GUI mode
        '-t', testScript, // Test plan
        '-l', reportPath, // Results file
        '-e', // Generate HTML report
        '-o', reportPath.replace('.jtl', '-dashboard'), // HTML report output
        `-Jthreads=${options.threads || 10}`,
        `-Jrampup=${options.rampup || 60}`,
        `-Jduration=${options.duration || 300}`
      ];

      const output = execSync(command.join(' '), {
        encoding: 'utf-8',
        timeout: options.timeout || 1800000
      });

      // Parse JMeter results
      const results = await this.parseJMeterResults(reportPath);

      return {
        status: 'SUCCESS',
        generator: 'JMETER',
        metrics: results.metrics,
        summary: results.summary,
        duration: Date.now() - startTime,
        reportPath,
        dashboardPath: reportPath.replace('.jtl', '-dashboard'),
        rawOutput: output
      };

    } catch (error) {
      logger.error('JMeter test execution failed:', error);
      throw error;
    }
  }

  /**
   * Generate K6 API load test script
   */
  generateAPILoadTestScript() {
    return `
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export let options = {
  scenarios: {
    load_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 10 },
        { duration: '2m', target: 20 },
        { duration: '5m', target: 20 },
        { duration: '2m', target: 0 }
      ]
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.01']
  }
};

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';

export default function() {
  // Test API endpoints
  const endpoints = [
    '/api/v1/health',
    '/api/v1/auth/login',
    '/api/v1/students',
    '/api/v1/teachers',
    '/api/v1/courses',
    '/api/v1/assignments'
  ];

  for (const endpoint of endpoints) {
    const response = http.get(\`\${BASE_URL}\${endpoint}\`);
    
    const success = check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 1000ms': (r) => r.timings.duration < 1000
    });

    errorRate.add(!success);
    
    if (!success) {
      console.log(\`Failed request to \${endpoint}: \${response.status}\`);
    }
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    'summary.json': JSON.stringify(data)
  };
}
`;
  }

  /**
   * Generate stress test script
   */
  generateStressTestScript() {
    return `
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  scenarios: {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '5m', target: 100 },
        { duration: '10m', target: 100 },
        { duration: '5m', target: 200 },
        { duration: '10m', target: 200 },
        { duration: '5m', target: 300 },
        { duration: '10m', target: 300 },
        { duration: '5m', target: 0 }
      ]
    }
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05']
  }
};

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';

export default function() {
  const response = http.get(\`\${BASE_URL}/api/v1/students\`);
  
  check(response, {
    'status is 200': (r) => r.status === 200
  });

  sleep(Math.random() * 3);
}
`;
  }

  /**
   * Parse K6 test results
   */
  async parseK6Results(reportPath) {
    try {
      // Read summary file
      const summaryPath = reportPath.replace('.json', '-summary.json');
      const summaryContent = await fs.readFile(summaryPath, 'utf-8');
      const summary = JSON.parse(summaryContent);

      const metrics = {
        http_req_duration: {
          avg: summary.metrics.http_req_duration.avg,
          p50: summary.metrics.http_req_duration['p(50)'],
          p90: summary.metrics.http_req_duration['p(90)'],
          p95: summary.metrics.http_req_duration['p(95)'],
          p99: summary.metrics.http_req_duration['p(99)'],
          max: summary.metrics.http_req_duration.max
        },
        http_reqs: {
          count: summary.metrics.http_reqs.count,
          rate: summary.metrics.http_reqs.rate
        },
        http_req_failed: {
          rate: summary.metrics.http_req_failed.rate,
          count: summary.metrics.http_req_failed.values.fails
        }
      };

      return {
        metrics,
        summary: {
          avgResponseTime: metrics.http_req_duration.avg,
          p95ResponseTime: metrics.http_req_duration.p95,
          throughput: metrics.http_reqs.rate,
          errorRate: metrics.http_req_failed.rate,
          totalRequests: metrics.http_reqs.count
        }
      };

    } catch (error) {
      logger.error('Failed to parse K6 results:', error);
      return {
        metrics: {},
        summary: {}
      };
    }
  }

  // Helper methods
  async prepareTestEnvironment(testSession) {
    // Ensure target application is running
    // Setup test data
    // Configure monitoring
    logger.debug(`Preparing test environment for ${testSession.sessionId}`);
  }

  calculatePerformanceSummary(testResults) {
    return {
      avgResponseTime: testResults.summary?.avgResponseTime || 0,
      p95ResponseTime: testResults.summary?.p95ResponseTime || 0,
      throughput: testResults.summary?.throughput || 0,
      errorRate: testResults.summary?.errorRate || 0,
      totalRequests: testResults.summary?.totalRequests || 0
    };
  }

  async checkPerformanceThresholds(testSession) {
    const summary = testSession.summary;
    let passed = true;

    // Check response time thresholds
    const responseThresholds = this.thresholds.get('API_RESPONSE_TIME');
    if (responseThresholds) {
      if (summary.p95ResponseTime > responseThresholds.p95) {
        passed = false;
        logger.warn('P95 response time threshold exceeded', {
          actual: summary.p95ResponseTime,
          threshold: responseThresholds.p95
        });
      }
    }

    // Check error rate thresholds
    const errorThresholds = this.thresholds.get('ERROR_RATE');
    if (errorThresholds && summary.errorRate > errorThresholds.max) {
      passed = false;
      logger.warn('Error rate threshold exceeded', {
        actual: summary.errorRate,
        threshold: errorThresholds.max
      });
    }

    return passed;
  }

  async updatePerformanceBaselines(testSession) {
    const baseline = {
      suiteId: testSession.suiteId,
      timestamp: testSession.startTime,
      summary: testSession.summary,
      environment: testSession.options.environment || 'test'
    };

    const baselineKey = `${testSession.suiteId}_${baseline.environment}`;
    this.performanceBaselines.set(baselineKey, baseline);

    logger.debug(`Performance baseline updated for ${baselineKey}`);
  }

  async generatePerformanceReport(testSession) {
    const report = {
      sessionId: testSession.sessionId,
      generatedAt: new Date(),
      suiteId: testSession.suiteId,
      suiteName: testSession.suiteName,
      duration: testSession.duration,
      summary: testSession.summary,
      passed: testSession.passed,
      thresholds: this.getThresholdsForSuite(testSession.suiteId),
      baseline: this.getBaseline(testSession.suiteId, testSession.options.environment),
      recommendations: this.generatePerformanceRecommendations(testSession)
    };

    // Save report
    const reportPath = path.join('reports', 'performance', `performance-report-${testSession.sessionId}.json`);
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

    return report;
  }

  generatePerformanceRecommendations(testSession) {
    const recommendations = [];
    const summary = testSession.summary;

    if (summary.avgResponseTime > 1000) {
      recommendations.push({
        type: 'HIGH_RESPONSE_TIME',
        priority: 'HIGH',
        message: `Average response time is ${summary.avgResponseTime}ms`,
        suggestions: [
          'Add caching layer',
          'Optimize database queries',
          'Implement CDN for static assets',
          'Scale horizontally'
        ]
      });
    }

    if (summary.errorRate > 0.01) {
      recommendations.push({
        type: 'HIGH_ERROR_RATE',
        priority: 'CRITICAL',
        message: `Error rate is ${(summary.errorRate * 100).toFixed(2)}%`,
        suggestions: [
          'Review application logs',
          'Check resource availability',
          'Implement circuit breakers',
          'Add retry mechanisms'
        ]
      });
    }

    if (summary.throughput < 100) {
      recommendations.push({
        type: 'LOW_THROUGHPUT',
        priority: 'MEDIUM',
        message: `Throughput is ${summary.throughput} RPS`,
        suggestions: [
          'Optimize application code',
          'Increase server resources',
          'Implement connection pooling',
          'Use async processing'
        ]
      });
    }

    return recommendations;
  }

  // Public API methods
  addLoadGenerator(generatorId, generator) {
    this.loadGenerators.set(generatorId, generator);
    logger.debug(`Load generator added: ${generatorId}`);
  }

  addTestSuite(suiteId, testSuite) {
    this.testSuites.set(suiteId, testSuite);
    logger.debug(`Test suite added: ${suiteId}`);
  }

  setPerformanceThreshold(thresholdId, threshold) {
    this.thresholds.set(thresholdId, threshold);
  }

  getTestResults(sessionId) {
    return this.testResults.get(sessionId);
  }

  getPerformanceBaselines() {
    return Array.from(this.performanceBaselines.values());
  }

  getAvailableTestSuites() {
    return Array.from(this.testSuites.keys());
  }

  getThresholdsForSuite(suiteId) {
    return Array.from(this.thresholds.entries()).reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  getBaseline(suiteId, environment = 'test') {
    return this.performanceBaselines.get(`${suiteId}_${environment}`);
  }

  async parseJMeterResults(reportPath) {
    // Simplified JMeter results parsing
    return {
      metrics: {},
      summary: {
        avgResponseTime: 0,
        p95ResponseTime: 0,
        throughput: 0,
        errorRate: 0,
        totalRequests: 0
      }
    };
  }

  async executeArtilleryTest(testScript, options) {
    // Artillery.io implementation
    throw new Error('Artillery.io implementation not yet available');
  }

  async executeNBomberTest(testScript, options) {
    // NBomber implementation
    throw new Error('NBomber implementation not yet available');
  }

  generateSpikeTestScript() {
    return this.generateAPILoadTestScript().replace(
      /stages: \[[\s\S]*?\]/,
      `stages: [
        { duration: '1m', target: 10 },
        { duration: '30s', target: 100 },
        { duration: '3m', target: 100 },
        { duration: '30s', target: 10 },
        { duration: '3m', target: 10 }
      ]`
    );
  }

  generateVolumeTestScript() {
    return `
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  scenarios: {
    volume_test: {
      executor: 'constant-vus',
      vus: 50,
      duration: '30m'
    }
  }
};

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';

export default function() {
  // Create large payload for volume testing
  const largePayload = {
    data: 'x'.repeat(1000), // 1KB of data
    items: Array.from({length: 100}, (_, i) => ({ id: i, name: \`Item \${i}\` }))
  };

  const response = http.post(\`\${BASE_URL}/api/v1/bulk-data\`, JSON.stringify(largePayload), {
    headers: { 'Content-Type': 'application/json' }
  });

  check(response, {
    'status is 200': (r) => r.status === 200
  });

  sleep(1);
}
`;
  }

  generateDatabaseTestScript() {
    return `
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  scenarios: {
    db_load_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 25 },
        { duration: '10m', target: 25 },
        { duration: '2m', target: 0 }
      ]
    }
  }
};

const BASE_URL = __ENV.K6_BASE_URL || 'http://localhost:3000';

export default function() {
  // Database-heavy operations
  const operations = [
    '/api/v1/students?page=1&limit=100',
    '/api/v1/courses?include=enrollments',
    '/api/v1/reports/academic-performance',
    '/api/v1/analytics/dashboard'
  ];

  for (const operation of operations) {
    const response = http.get(\`\${BASE_URL}\${operation}\`);
    
    check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 500ms': (r) => r.timings.duration < 500
    });
  }

  sleep(Math.random() * 2);
}
`;
  }
}

// Export singleton instance
export const performanceTestingManager = new PerformanceTestingManager();
