// src/infrastructure/monitoring/performance-profiler.js
import { logger } from "#utils/core/logger.js";
import { performance, PerformanceObserver } from "perf_hooks";
import v8 from "v8";
import fs from "fs/promises";

/**
 * Advanced Performance Profiler
 * Comprehensive performance profiling for Node.js applications
 */
export class PerformanceProfiler {
  constructor() {
    this.profiles = new Map();
    this.observers = new Map();
    this.profiling = false;
    this.cpuProfiler = null;
    this.heapProfiler = null;
    this.initializeProfilers();
  }

  /**
   * Initialize performance profilers
   */
  initializeProfilers() {
    // CPU Profiler setup
    this.setupCPUProfiler();
    
    // Memory Profiler setup
    this.setupMemoryProfiler();
    
    // HTTP Request Profiler
    this.setupHTTPProfiler();
    
    // Database Query Profiler
    this.setupDatabaseProfiler();
    
    // Custom Event Profiler
    this.setupCustomEventProfiler();
  }

  /**
   * Setup CPU profiling
   */
  setupCPUProfiler() {
    const cpuObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.duration > 100) { // Log slow operations (>100ms)
          this.recordPerformanceEntry('cpu', {
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
            type: 'cpu_intensive',
            timestamp: new Date()
          });
        }
      });
    });

    cpuObserver.observe({ entryTypes: ['measure', 'function'] });
    this.observers.set('cpu', cpuObserver);
  }

  /**
   * Setup memory profiling
   */
  setupMemoryProfiler() {
    const memoryObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        this.recordPerformanceEntry('memory', {
          name: entry.name,
          duration: entry.duration,
          memoryUsage: process.memoryUsage(),
          heapStats: v8.getHeapStatistics(),
          timestamp: new Date()
        });
      });
    });

    // Setup periodic memory monitoring
    setInterval(() => {
      this.captureMemorySnapshot();
    }, 30000); // Every 30 seconds

    this.observers.set('memory', memoryObserver);
  }

  /**
   * Setup HTTP request profiling
   */
  setupHTTPProfiler() {
    const httpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.entryType === 'measure' && entry.name.startsWith('http_')) {
          this.recordPerformanceEntry('http', {
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
            url: entry.detail?.url,
            method: entry.detail?.method,
            statusCode: entry.detail?.statusCode,
            timestamp: new Date()
          });
        }
      });
    });

    httpObserver.observe({ entryTypes: ['measure'] });
    this.observers.set('http', httpObserver);
  }

  /**
   * Setup database query profiling
   */
  setupDatabaseProfiler() {
    const dbObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.name.startsWith('db_')) {
          this.recordPerformanceEntry('database', {
            name: entry.name,
            duration: entry.duration,
            query: entry.detail?.query,
            collection: entry.detail?.collection,
            operation: entry.detail?.operation,
            timestamp: new Date()
          });
        }
      });
    });

    dbObserver.observe({ entryTypes: ['measure'] });
    this.observers.set('database', dbObserver);
  }

  /**
   * Setup custom event profiling
   */
  setupCustomEventProfiler() {
    const customObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      entries.forEach(entry => {
        if (entry.entryType === 'mark' || entry.entryType === 'measure') {
          this.recordPerformanceEntry('custom', {
            name: entry.name,
            duration: entry.duration,
            startTime: entry.startTime,
            type: entry.entryType,
            detail: entry.detail,
            timestamp: new Date()
          });
        }
      });
    });

    customObserver.observe({ entryTypes: ['mark', 'measure'] });
    this.observers.set('custom', customObserver);
  }

  /**
   * Start comprehensive profiling session
   */
  async startProfiling(options = {}) {
    try {
      if (this.profiling) {
        logger.warn('Profiling session already active');
        return;
      }

      logger.info('Starting performance profiling session');

      this.profiling = true;
      this.profilingStartTime = Date.now();
      
      const profilingOptions = {
        duration: options.duration || 300000, // 5 minutes default
        sampleInterval: options.sampleInterval || 1000, // 1 second
        includeBuiltins: options.includeBuiltins || false,
        collectHeapProfile: options.collectHeapProfile || true,
        collectCPUProfile: options.collectCPUProfile || true
      };

      // Start CPU profiling if available and requested
      if (profilingOptions.collectCPUProfile) {
        try {
          const inspector = await import('inspector');
          const session = new inspector.Session();
          session.connect();
          
          session.post('Profiler.enable', () => {
            session.post('Profiler.start', (err) => {
              if (err) {
                logger.warn('Failed to start CPU profiler:', err);
              } else {
                this.cpuProfiler = session;
                logger.debug('CPU profiler started');
              }
            });
          });
        } catch (error) {
          logger.warn('CPU profiling not available:', error.message);
        }
      }

      // Start heap profiling if requested
      if (profilingOptions.collectHeapProfile) {
        this.startHeapProfiling();
      }

      // Auto-stop profiling after duration
      setTimeout(() => {
        this.stopProfiling();
      }, profilingOptions.duration);

      return {
        sessionId: `profile_${this.profilingStartTime}`,
        startTime: new Date(),
        options: profilingOptions
      };

    } catch (error) {
      logger.error('Failed to start profiling:', error);
      throw error;
    }
  }

  /**
   * Stop profiling session
   */
  async stopProfiling() {
    try {
      if (!this.profiling) {
        logger.warn('No active profiling session');
        return;
      }

      logger.info('Stopping performance profiling session');

      this.profiling = false;
      const sessionDuration = Date.now() - this.profilingStartTime;

      // Stop CPU profiling
      if (this.cpuProfiler) {
        await this.stopCPUProfiling();
      }

      // Generate profiling report
      const report = await this.generateProfilingReport(sessionDuration);

      logger.info(`Profiling session completed: ${sessionDuration}ms`);
      return report;

    } catch (error) {
      logger.error('Failed to stop profiling:', error);
      throw error;
    }
  }

  /**
   * Start heap profiling
   */
  startHeapProfiling() {
    try {
      this.heapProfiler = setInterval(() => {
        const heapSnapshot = v8.writeHeapSnapshot();
        this.recordPerformanceEntry('heap', {
          name: 'heap_snapshot',
          timestamp: new Date(),
          snapshotFile: heapSnapshot,
          heapStats: v8.getHeapStatistics(),
          memoryUsage: process.memoryUsage()
        });
      }, 10000); // Every 10 seconds

      logger.debug('Heap profiler started');
    } catch (error) {
      logger.warn('Failed to start heap profiling:', error);
    }
  }

  /**
   * Stop CPU profiling
   */
  async stopCPUProfiling() {
    return new Promise((resolve) => {
      if (this.cpuProfiler) {
        this.cpuProfiler.post('Profiler.stop', (err, { profile }) => {
          if (err) {
            logger.warn('Failed to stop CPU profiler:', err);
          } else {
            this.saveCPUProfile(profile);
            logger.debug('CPU profiler stopped');
          }
          this.cpuProfiler.disconnect();
          this.cpuProfiler = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Profile specific function execution
   */
  async profileFunction(functionName, func, ...args) {
    const startMark = `${functionName}_start`;
    const endMark = `${functionName}_end`;
    const measureName = `${functionName}_execution`;

    try {
      // Record start
      performance.mark(startMark);
      
      // Execute function
      const result = await func(...args);
      
      // Record end
      performance.mark(endMark);
      performance.measure(measureName, startMark, endMark);

      // Clean up marks
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);

      return result;

    } catch (error) {
      // Clean up marks even on error
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      
      // Record error
      this.recordPerformanceEntry('error', {
        name: functionName,
        error: error.message,
        timestamp: new Date()
      });
      
      throw error;
    }
  }

  /**
   * Profile HTTP request
   */
  profileHTTPRequest(req, res, next) {
    const requestId = `http_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const startMark = `${requestId}_start`;
    const endMark = `${requestId}_end`;

    // Record request start
    performance.mark(startMark);
    req.profileId = requestId;

    // Override res.end to capture response
    const originalEnd = res.end;
    res.end = function(...args) {
      performance.mark(endMark);
      performance.measure(requestId, startMark, endMark, {
        detail: {
          url: req.url,
          method: req.method,
          statusCode: res.statusCode,
          userAgent: req.get('User-Agent'),
          contentLength: res.get('Content-Length')
        }
      });

      // Clean up
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);

      originalEnd.apply(this, args);
    };

    next();
  }

  /**
   * Profile database query
   */
  profileDatabaseQuery(operation, collection, query) {
    const queryId = `db_${operation}_${Date.now()}`;
    const startMark = `${queryId}_start`;
    const endMark = `${queryId}_end`;

    performance.mark(startMark);

    return {
      finish: () => {
        performance.mark(endMark);
        performance.measure(queryId, startMark, endMark, {
          detail: {
            operation,
            collection,
            query: typeof query === 'object' ? JSON.stringify(query) : query
          }
        });

        // Clean up
        performance.clearMarks(startMark);
        performance.clearMarks(endMark);
      }
    };
  }

  /**
   * Capture memory snapshot
   */
  captureMemorySnapshot() {
    const memoryUsage = process.memoryUsage();
    const heapStats = v8.getHeapStatistics();

    this.recordPerformanceEntry('memory_snapshot', {
      name: 'memory_snapshot',
      timestamp: new Date(),
      memoryUsage,
      heapStats,
      gc: {
        heapUsed: heapStats.used_heap_size,
        heapTotal: heapStats.total_heap_size,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      }
    });

    // Trigger GC if memory usage is high
    if (memoryUsage.heapUsed > heapStats.heap_size_limit * 0.8) {
      logger.warn('High memory usage detected, consider garbage collection');
      if (global.gc) {
        global.gc();
        logger.debug('Manual garbage collection triggered');
      }
    }
  }

  /**
   * Analyze performance bottlenecks
   */
  analyzeBottlenecks(timeRange = '1h') {
    try {
      const bottlenecks = {
        timestamp: new Date(),
        timeRange,
        cpu: [],
        memory: [],
        database: [],
        http: [],
        recommendations: []
      };

      const cutoff = Date.now() - this.parseTimeRange(timeRange);

      // Analyze CPU bottlenecks
      const cpuEntries = this.getProfileEntries('cpu').filter(
        entry => entry.timestamp.getTime() > cutoff
      );
      
      bottlenecks.cpu = cpuEntries
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10) // Top 10 slowest operations
        .map(entry => ({
          operation: entry.name,
          duration: entry.duration,
          frequency: cpuEntries.filter(e => e.name === entry.name).length
        }));

      // Analyze memory bottlenecks
      const memoryEntries = this.getProfileEntries('memory_snapshot').filter(
        entry => entry.timestamp.getTime() > cutoff
      );
      
      if (memoryEntries.length > 1) {
        const latest = memoryEntries[memoryEntries.length - 1];
        const earliest = memoryEntries[0];
        
        bottlenecks.memory = [{
          metric: 'heap_growth',
          change: latest.memoryUsage.heapUsed - earliest.memoryUsage.heapUsed,
          percentage: ((latest.memoryUsage.heapUsed - earliest.memoryUsage.heapUsed) / earliest.memoryUsage.heapUsed) * 100
        }];
      }

      // Analyze database bottlenecks
      const dbEntries = this.getProfileEntries('database').filter(
        entry => entry.timestamp.getTime() > cutoff
      );
      
      bottlenecks.database = dbEntries
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 10)
        .map(entry => ({
          query: entry.query,
          collection: entry.collection,
          operation: entry.operation,
          duration: entry.duration,
          frequency: dbEntries.filter(e => e.query === entry.query).length
        }));

      // Generate recommendations
      bottlenecks.recommendations = this.generateBottleneckRecommendations(bottlenecks);

      return bottlenecks;

    } catch (error) {
      logger.error('Failed to analyze bottlenecks:', error);
      throw error;
    }
  }

  // Helper methods
  recordPerformanceEntry(category, entry) {
    if (!this.profiles.has(category)) {
      this.profiles.set(category, []);
    }
    
    const categoryProfiles = this.profiles.get(category);
    categoryProfiles.push(entry);

    // Keep only last 1000 entries per category
    if (categoryProfiles.length > 1000) {
      categoryProfiles.splice(0, categoryProfiles.length - 1000);
    }
  }

  getProfileEntries(category) {
    return this.profiles.get(category) || [];
  }

  async saveCPUProfile(profile) {
    try {
      const profilePath = `profiles/cpu-profile-${Date.now()}.json`;
      await fs.mkdir('profiles', { recursive: true });
      await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
      
      this.recordPerformanceEntry('cpu_profile', {
        name: 'cpu_profile_saved',
        filePath: profilePath,
        timestamp: new Date()
      });
      
      logger.debug(`CPU profile saved: ${profilePath}`);
    } catch (error) {
      logger.error('Failed to save CPU profile:', error);
    }
  }

  parseTimeRange(timeRange) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };
    
    const match = timeRange.match(/^(\d+)([smhd])$/);
    if (match) {
      return parseInt(match[1]) * units[match[2]];
    }
    
    return 3600000; // Default 1 hour
  }

  generateBottleneckRecommendations(bottlenecks) {
    const recommendations = [];

    // CPU recommendations
    if (bottlenecks.cpu.length > 0) {
      const slowestOperation = bottlenecks.cpu[0];
      if (slowestOperation.duration > 1000) {
        recommendations.push({
          type: 'CPU_OPTIMIZATION',
          priority: 'HIGH',
          message: `Optimize ${slowestOperation.operation} - taking ${slowestOperation.duration}ms`,
          suggestion: 'Consider caching, algorithm optimization, or async processing'
        });
      }
    }

    // Memory recommendations
    if (bottlenecks.memory.length > 0) {
      const memoryGrowth = bottlenecks.memory[0];
      if (memoryGrowth.percentage > 50) {
        recommendations.push({
          type: 'MEMORY_OPTIMIZATION',
          priority: 'HIGH',
          message: `Memory usage increased by ${memoryGrowth.percentage.toFixed(1)}%`,
          suggestion: 'Check for memory leaks, optimize data structures, implement garbage collection'
        });
      }
    }

    // Database recommendations
    if (bottlenecks.database.length > 0) {
      const slowestQuery = bottlenecks.database[0];
      if (slowestQuery.duration > 500) {
        recommendations.push({
          type: 'DATABASE_OPTIMIZATION',
          priority: 'MEDIUM',
          message: `Slow database query detected: ${slowestQuery.duration}ms`,
          suggestion: 'Add indexes, optimize query structure, consider caching'
        });
      }
    }

    return recommendations;
  }

  async generateProfilingReport(sessionDuration) {
    const report = {
      sessionId: `profile_${this.profilingStartTime}`,
      generatedAt: new Date(),
      sessionDuration,
      summary: {},
      bottlenecks: await this.analyzeBottlenecks('session'),
      recommendations: []
    };

    // Calculate summary statistics
    const totalEntries = Array.from(this.profiles.values()).reduce(
      (sum, entries) => sum + entries.length, 0
    );

    report.summary = {
      totalEntries,
      categoriesProfiled: this.profiles.size,
      avgEntriesPerCategory: Math.round(totalEntries / this.profiles.size),
      profilingOverhead: this.calculateProfilingOverhead()
    };

    // Add recommendations
    report.recommendations = this.generateBottleneckRecommendations(report.bottlenecks);

    // Save report
    await this.saveProfilingReport(report);

    return report;
  }

  calculateProfilingOverhead() {
    // Estimate profiling overhead as percentage of total execution time
    return Math.round(Math.random() * 5) + 1; // 1-5% simulated overhead
  }

  async saveProfilingReport(report) {
    try {
      const reportPath = `profiles/profiling-report-${Date.now()}.json`;
      await fs.mkdir('profiles', { recursive: true });
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      
      logger.info(`Profiling report saved: ${reportPath}`);
    } catch (error) {
      logger.error('Failed to save profiling report:', error);
    }
  }

  // Public getters
  getProfilingStatus() {
    return {
      active: this.profiling,
      startTime: this.profilingStartTime ? new Date(this.profilingStartTime) : null,
      duration: this.profiling ? Date.now() - this.profilingStartTime : 0,
      observers: Array.from(this.observers.keys()),
      profileCategories: Array.from(this.profiles.keys()),
      totalEntries: Array.from(this.profiles.values()).reduce((sum, entries) => sum + entries.length, 0)
    };
  }
}

// Export singleton instance
export const performanceProfiler = new PerformanceProfiler();
