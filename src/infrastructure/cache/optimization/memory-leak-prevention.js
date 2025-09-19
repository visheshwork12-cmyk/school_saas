// src/infrastructure/optimization/memory-leak-prevention.js
import { logger } from "#utils/core/logger.js";
import { EventEmitter } from "events";
import fs from "fs/promises";
import path from "path";
import v8 from "v8";

/**
 * Memory Leak Prevention System
 * Comprehensive system to detect, prevent, and monitor memory leaks
 */
export class MemoryLeakPrevention extends EventEmitter {
  constructor() {
    super();
    this.memorySnapshots = [];
    this.memoryThresholds = {
      warning: 100 * 1024 * 1024, // 100MB
      critical: 500 * 1024 * 1024, // 500MB
      maximum: 1000 * 1024 * 1024  // 1GB
    };
    this.monitoringInterval = null;
    this.leakDetectors = new Map();
    this.globalRefs = new WeakSet();
    this.preventionStrategies = new Map();
    this.initializeLeakDetectors();
    this.initializePreventionStrategies();
  }

  /**
   * Initialize memory leak detectors
   */
  initializeLeakDetectors() {
    // Global variable detector
    this.addLeakDetector('GLOBAL_VARIABLES', {
      name: 'Global Variables Leak Detector',
      detect: this.detectGlobalVariableLeaks.bind(this),
      severity: 'HIGH'
    });

    // Event listener detector
    this.addLeakDetector('EVENT_LISTENERS', {
      name: 'Event Listeners Leak Detector',
      detect: this.detectEventListenerLeaks.bind(this),
      severity: 'HIGH'
    });

    // Closure detector
    this.addLeakDetector('CLOSURES', {
      name: 'Closure Memory Leak Detector',
      detect: this.detectClosureLeaks.bind(this),
      severity: 'MEDIUM'
    });

    // Timer detector
    this.addLeakDetector('TIMERS', {
      name: 'Timer Leak Detector',
      detect: this.detectTimerLeaks.bind(this),
      severity: 'HIGH'
    });

    // DOM reference detector (for frontend code)
    this.addLeakDetector('DOM_REFERENCES', {
      name: 'DOM Reference Leak Detector',
      detect: this.detectDOMLeaks.bind(this),
      severity: 'MEDIUM'
    });

    // Large object detector
    this.addLeakDetector('LARGE_OBJECTS', {
      name: 'Large Object Leak Detector',
      detect: this.detectLargeObjectLeaks.bind(this),
      severity: 'MEDIUM'
    });
  }

  /**
   * Initialize memory leak prevention strategies
   */
  initializePreventionStrategies() {
    // Automatic cleanup strategy
    this.addPreventionStrategy('AUTO_CLEANUP', {
      name: 'Automatic Cleanup',
      implement: this.implementAutoCleanup.bind(this),
      priority: 1
    });

    // Weak reference strategy
    this.addPreventionStrategy('WEAK_REFERENCES', {
      name: 'Weak References Implementation',
      implement: this.implementWeakReferences.bind(this),
      priority: 2
    });

    // Resource pooling strategy
    this.addPreventionStrategy('RESOURCE_POOLING', {
      name: 'Resource Pooling',
      implement: this.implementResourcePooling.bind(this),
      priority: 3
    });

    // Memory monitoring strategy
    this.addPreventionStrategy('MEMORY_MONITORING', {
      name: 'Continuous Memory Monitoring',
      implement: this.implementMemoryMonitoring.bind(this),
      priority: 4
    });
  }

  /**
   * Start comprehensive memory monitoring
   */
  startMemoryMonitoring(intervalMs = 60000) {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(async () => {
      await this.performMemoryCheck();
    }, intervalMs);

    // Take initial snapshot
    setImmediate(() => {
      this.takeMemorySnapshot('initial');
    });

    logger.info('Memory leak monitoring started');
  }

  /**
   * Perform comprehensive memory check
   */
  async performMemoryCheck() {
    try {
      // Get current memory usage
      const memoryUsage = process.memoryUsage();
      const heapSnapshot = this.takeMemorySnapshot('monitoring');

      // Check memory thresholds
      this.checkMemoryThresholds(memoryUsage);

      // Run leak detectors
      const leakResults = await this.runLeakDetectors();

      // Analyze memory trends
      const trendAnalysis = this.analyzeMemoryTrends();

      // Generate alerts if necessary
      if (this.shouldGenerateAlert(memoryUsage, leakResults, trendAnalysis)) {
        await this.generateMemoryAlert(memoryUsage, leakResults, trendAnalysis);
      }

      // Store monitoring data
      this.storeMonitoringData({
        timestamp: new Date(),
        memoryUsage,
        heapSnapshot,
        leakResults,
        trendAnalysis
      });

    } catch (error) {
      logger.error('Memory monitoring check failed:', error);
    }
  }

  /**
   * Take memory snapshot
   */
  takeMemorySnapshot(label = 'snapshot') {
    const snapshot = {
      label,
      timestamp: new Date(),
      memoryUsage: process.memoryUsage(),
      heapStatistics: v8.getHeapStatistics(),
      heapSpaceStatistics: v8.getHeapSpaceStatistics()
    };

    this.memorySnapshots.push(snapshot);

    // Keep only last 100 snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots = this.memorySnapshots.slice(-100);
    }

    return snapshot;
  }

  /**
   * Run all leak detectors
   */
  async runLeakDetectors() {
    const results = {};

    for (const [detectorId, detector] of this.leakDetectors) {
      try {
        const leaks = await detector.detect();
        results[detectorId] = {
          name: detector.name,
          severity: detector.severity,
          leaksDetected: leaks.length,
          leaks: leaks
        };
      } catch (error) {
        logger.warn(`Leak detector ${detectorId} failed:`, error.message);
        results[detectorId] = {
          name: detector.name,
          error: error.message
        };
      }
    }

    return results;
  }

  /**
   * Detect global variable leaks
   */
  async detectGlobalVariableLeaks() {
    const leaks = [];
    const globalKeys = Object.keys(global);
    
    // Track new globals
    if (!this.initialGlobals) {
      this.initialGlobals = new Set(globalKeys);
      return leaks;
    }

    for (const key of globalKeys) {
      if (!this.initialGlobals.has(key) && 
          !key.startsWith('_') && 
          typeof global[key] !== 'function') {
        
        leaks.push({
          type: 'global_variable',
          variable: key,
          value: typeof global[key],
          size: this.estimateObjectSize(global[key]),
          stackTrace: this.captureStackTrace()
        });
      }
    }

    return leaks;
  }

  /**
   * Detect event listener leaks
   */
  async detectEventListenerLeaks() {
    const leaks = [];
    
    // Check EventEmitter instances
    if (global.process && global.process.listeners) {
      const processListeners = global.process.eventNames();
      
      for (const eventName of processListeners) {
        const listeners = global.process.listeners(eventName);
        
        if (listeners.length > 10) { // Threshold for potential leak
          leaks.push({
            type: 'process_event_listeners',
            event: eventName,
            listenerCount: listeners.length,
            target: 'process'
          });
        }
      }
    }

    // Check custom EventEmitter instances (would need registry)
    return leaks;
  }

  /**
   * Detect closure memory leaks
   */
  async detectClosureLeaks() {
    const leaks = [];
    
    // This is a simplified detection - real implementation would use heap profiling
    // Check for functions that might be holding large closures
    
    return leaks;
  }

  /**
   * Detect timer leaks
   */
  async detectTimerLeaks() {
    const leaks = [];
    
    // Check for active timers (Node.js specific)
    if (process._getActiveHandles) {
      const handles = process._getActiveHandles();
      const timerHandles = handles.filter(handle => 
        handle.constructor.name.includes('Timer') || 
        handle.constructor.name.includes('Timeout')
      );
      
      if (timerHandles.length > 50) { // Threshold for potential leak
        leaks.push({
          type: 'timer_handles',
          count: timerHandles.length,
          message: 'High number of active timer handles detected'
        });
      }
    }

    return leaks;
  }

  /**
   * Detect DOM reference leaks (for frontend environments)
   */
  async detectDOMLeaks() {
    const leaks = [];
    
    // This would be implemented for browser environments
    // Check for detached DOM nodes, event listeners on removed elements, etc.
    
    return leaks;
  }

  /**
   * Detect large object leaks
   */
  async detectLargeObjectLeaks() {
    const leaks = [];
    
    // Monitor heap growth patterns
    if (this.memorySnapshots.length >= 2) {
      const current = this.memorySnapshots[this.memorySnapshots.length - 1];
      const previous = this.memorySnapshots[this.memorySnapshots.length - 2];
      
      const heapGrowth = current.memoryUsage.heapUsed - previous.memoryUsage.heapUsed;
      const timeDiff = current.timestamp - previous.timestamp;
      
      // If heap grows more than 10MB per minute consistently
      const growthRate = (heapGrowth / timeDiff) * 60000; // bytes per minute
      
      if (growthRate > 10 * 1024 * 1024) {
        leaks.push({
          type: 'heap_growth',
          growthRate: growthRate,
          message: 'Rapid heap growth detected',
          heapGrowth: heapGrowth
        });
      }
    }

    return leaks;
  }

  /**
   * Implement automatic cleanup strategy
   */
  implementAutoCleanup() {
    const cleanupStrategies = {
      // Automatic null assignment for large objects
      autoNullify: (obj, ttl = 300000) => { // 5 minutes default TTL
        setTimeout(() => {
          if (obj && typeof obj === 'object') {
            Object.keys(obj).forEach(key => {
              obj[key] = null;
            });
          }
        }, ttl);
      },

      // Automatic event listener cleanup
      autoRemoveListeners: (emitter, maxAge = 600000) => { // 10 minutes
        const originalOn = emitter.on.bind(emitter);
        const listenerMap = new Map();
        
        emitter.on = function(event, listener) {
          const wrappedListener = (...args) => {
            const listenerInfo = listenerMap.get(listener);
            if (listenerInfo && Date.now() - listenerInfo.addedAt > maxAge) {
              this.removeListener(event, wrappedListener);
              listenerMap.delete(listener);
              return;
            }
            return listener.apply(this, args);
          };
          
          listenerMap.set(listener, { 
            addedAt: Date.now(), 
            wrappedListener,
            event 
          });
          
          return originalOn(event, wrappedListener);
        };
      },

      // Automatic timer cleanup
      autoCleanupTimers: () => {
        const originalSetTimeout = global.setTimeout;
        const originalSetInterval = global.setInterval;
        const activeTimers = new Set();
        
        global.setTimeout = function(...args) {
          const id = originalSetTimeout.apply(this, args);
          activeTimers.add(id);
          
          // Auto cleanup after 1 hour if not cleared
          originalSetTimeout(() => {
            activeTimers.delete(id);
          }, 3600000);
          
          return id;
        };
        
        global.setInterval = function(...args) {
          const id = originalSetInterval.apply(this, args);
          activeTimers.add(id);
          return id;
        };

        // Cleanup function
        return () => {
          activeTimers.forEach(id => {
            clearTimeout(id);
            clearInterval(id);
          });
          activeTimers.clear();
        };
      }
    };

    return cleanupStrategies;
  }

  /**
   * Implement weak references strategy
   */
  implementWeakReferences() {
    return {
      // Weak reference cache
      createWeakCache: () => {
        const cache = new WeakMap();
        const keyMap = new Map();
        
        return {
          set(key, value) {
            const weakKey = typeof key === 'object' ? key : { key };
            cache.set(weakKey, value);
            keyMap.set(key, weakKey);
          },
          
          get(key) {
            const weakKey = keyMap.get(key);
            return weakKey ? cache.get(weakKey) : undefined;
          },
          
          has(key) {
            const weakKey = keyMap.get(key);
            return weakKey ? cache.has(weakKey) : false;
          },
          
          delete(key) {
            const weakKey = keyMap.get(key);
            if (weakKey) {
              cache.delete(weakKey);
              keyMap.delete(key);
              return true;
            }
            return false;
          }
        };
      },

      // Weak reference registry
      createWeakRegistry: () => {
        const registry = new FinalizationRegistry((heldValue) => {
          logger.debug(`Object garbage collected: ${heldValue}`);
        });
        
        return {
          register(target, heldValue) {
            registry.register(target, heldValue);
          }
        };
      }
    };
  }

  /**
   * Generate memory optimization recommendations
   */
  generateMemoryOptimizationRecommendations() {
    return {
      // Best practices for memory management
      bestPractices: [
        {
          category: 'Variable Management',
          recommendations: [
            'Use const and let instead of var to limit scope',
            'Set large objects to null when no longer needed',
            'Avoid creating global variables accidentally',
            'Use local variables within functions when possible'
          ]
        },
        {
          category: 'Event Listeners',
          recommendations: [
            'Always remove event listeners when components unmount',
            'Use weak references for event listener callbacks',
            'Avoid anonymous functions as event listeners',
            'Implement automatic cleanup for long-lived listeners'
          ]
        },
        {
          category: 'Closures',
          recommendations: [
            'Be mindful of closure scope and captured variables',
            'Nullify references in closures when done',
            'Avoid creating closures in loops',
            'Use WeakMap/WeakSet for object associations'
          ]
        },
        {
          category: 'Timers and Intervals',
          recommendations: [
            'Always clear timers and intervals',
            'Use AbortController for cancellable operations',
            'Implement timeout for long-running operations',
            'Track active timers for cleanup'
          ]
        },
        {
          category: 'Data Structures',
          recommendations: [
            'Use appropriate data structures for use case',
            'Implement object pooling for frequently created objects',
            'Use streaming for large data processing',
            'Implement pagination for large datasets'
          ]
        }
      ],

      // Code patterns to avoid
      antiPatterns: [
        {
          pattern: 'Accidental globals',
          example: 'function() { myVar = "value"; }',
          fix: 'function() { const myVar = "value"; }'
        },
        {
          pattern: 'Forgotten event listeners',
          example: 'element.addEventListener("click", handler);',
          fix: 'element.addEventListener("click", handler); // Remember to removeEventListener'
        },
        {
          pattern: 'Circular references',
          example: 'obj1.ref = obj2; obj2.ref = obj1;',
          fix: 'Use WeakMap or careful cleanup'
        }
      ],

      // Memory-efficient utilities
      utilities: this.createMemoryEfficientUtilities()
    };
  }

  /**
   * Create memory-efficient utilities
   */
  createMemoryEfficientUtilities() {
    return {
      // Object pool implementation
      createObjectPool: (factory, reset, initialSize = 10) => {
        const pool = [];
        
        // Pre-populate pool
        for (let i = 0; i < initialSize; i++) {
          pool.push(factory());
        }
        
        return {
          acquire() {
            return pool.length > 0 ? pool.pop() : factory();
          },
          
          release(obj) {
            if (reset) reset(obj);
            pool.push(obj);
            
            // Prevent pool from growing too large
            if (pool.length > initialSize * 2) {
              pool.length = initialSize;
            }
          },
          
          size() {
            return pool.length;
          }
        };
      },

      // Memory-efficient event emitter
      createMemoryEfficientEmitter: () => {
        class MemoryEfficientEmitter extends EventEmitter {
          constructor() {
            super();
            this.setMaxListeners(50); // Prevent memory leaks from too many listeners
          }
          
          on(event, listener) {
            super.on(event, listener);
            
            // Auto cleanup after 1 hour
            const timeout = setTimeout(() => {
              this.removeListener(event, listener);
            }, 3600000);
            
            // Clean up timeout if listener is removed manually
            const originalRemoveListener = this.removeListener.bind(this);
            this.removeListener = function(evt, lstnr) {
              if (evt === event && lstnr === listener) {
                clearTimeout(timeout);
              }
              return originalRemoveListener(evt, lstnr);
            };
            
            return this;
          }
        }
        
        return new MemoryEfficientEmitter();
      },

      // Resource cleanup manager
      createCleanupManager: () => {
        const resources = new Set();
        
        return {
          register(resource, cleanup) {
            resources.add({ resource, cleanup });
          },
          
          cleanup() {
            for (const { resource, cleanup } of resources) {
              try {
                cleanup(resource);
              } catch (error) {
                logger.warn('Cleanup failed:', error);
              }
            }
            resources.clear();
          },
          
          unregister(resource) {
            for (const item of resources) {
              if (item.resource === resource) {
                resources.delete(item);
                break;
              }
            }
          }
        };
      }
    };
  }

  // Helper methods
  addLeakDetector(detectorId, detector) {
    this.leakDetectors.set(detectorId, detector);
  }

  addPreventionStrategy(strategyId, strategy) {
    this.preventionStrategies.set(strategyId, strategy);
  }

  checkMemoryThresholds(memoryUsage) {
    const heapUsed = memoryUsage.heapUsed;
    
    if (heapUsed > this.memoryThresholds.critical) {
      this.emit('memoryThreshold', {
        level: 'critical',
        usage: heapUsed,
        threshold: this.memoryThresholds.critical
      });
    } else if (heapUsed > this.memoryThresholds.warning) {
      this.emit('memoryThreshold', {
        level: 'warning',
        usage: heapUsed,
        threshold: this.memoryThresholds.warning
      });
    }
  }

  analyzeMemoryTrends() {
    if (this.memorySnapshots.length < 5) return null;
    
    const recent = this.memorySnapshots.slice(-5);
    const trend = {
      direction: 'stable',
      rate: 0,
      concern: 'low'
    };
    
    const growthRates = [];
    for (let i = 1; i < recent.length; i++) {
      const growth = recent[i].memoryUsage.heapUsed - recent[i-1].memoryUsage.heapUsed;
      const timeDiff = recent[i].timestamp - recent[i-1].timestamp;
      growthRates.push(growth / timeDiff);
    }
    
    const avgGrowthRate = growthRates.reduce((sum, rate) => sum + rate, 0) / growthRates.length;
    
    if (avgGrowthRate > 100) { // Growing more than 100 bytes per ms
      trend.direction = 'increasing';
      trend.rate = avgGrowthRate;
      trend.concern = avgGrowthRate > 1000 ? 'high' : 'medium';
    } else if (avgGrowthRate < -100) {
      trend.direction = 'decreasing';
      trend.rate = Math.abs(avgGrowthRate);
      trend.concern = 'low';
    }
    
    return trend;
  }

  shouldGenerateAlert(memoryUsage, leakResults, trendAnalysis) {
    // Generate alert if memory usage is high
    if (memoryUsage.heapUsed > this.memoryThresholds.warning) return true;
    
    // Generate alert if leaks detected
    const totalLeaks = Object.values(leakResults).reduce(
      (sum, result) => sum + (result.leaksDetected || 0), 0
    );
    if (totalLeaks > 0) return true;
    
    // Generate alert if concerning memory trend
    if (trendAnalysis && trendAnalysis.concern === 'high') return true;
    
    return false;
  }

  async generateMemoryAlert(memoryUsage, leakResults, trendAnalysis) {
    const alert = {
      timestamp: new Date(),
      severity: this.calculateAlertSeverity(memoryUsage, leakResults, trendAnalysis),
      memoryUsage,
      leakResults,
      trendAnalysis,
      recommendations: await this.generateAlertRecommendations(leakResults)
    };

    this.emit('memoryAlert', alert);
    logger.warn('Memory alert generated', {
      severity: alert.severity,
      heapUsed: memoryUsage.heapUsed,
      leaksDetected: Object.keys(leakResults).length
    });
  }

  calculateAlertSeverity(memoryUsage, leakResults, trendAnalysis) {
    if (memoryUsage.heapUsed > this.memoryThresholds.critical) return 'CRITICAL';
    
    const highSeverityLeaks = Object.values(leakResults).some(
      result => result.severity === 'HIGH' && result.leaksDetected > 0
    );
    if (highSeverityLeaks) return 'HIGH';
    
    if (trendAnalysis && trendAnalysis.concern === 'high') return 'HIGH';
    
    return 'MEDIUM';
  }

  async generateAlertRecommendations(leakResults) {
    const recommendations = [];
    
    for (const [detectorId, result] of Object.entries(leakResults)) {
      if (result.leaksDetected > 0) {
        switch (detectorId) {
          case 'GLOBAL_VARIABLES':
            recommendations.push('Review global variable usage and implement proper scoping');
            break;
          case 'EVENT_LISTENERS':
            recommendations.push('Audit event listeners and implement proper cleanup');
            break;
          case 'TIMERS':
            recommendations.push('Review timer usage and ensure proper clearance');
            break;
          case 'LARGE_OBJECTS':
            recommendations.push('Implement object pooling or optimize large object usage');
            break;
        }
      }
    }
    
    return recommendations;
  }

  estimateObjectSize(obj) {
    // Simple size estimation - in production, use proper memory profiling
    const str = JSON.stringify(obj);
    return str ? str.length * 2 : 0; // Rough estimate
  }

  captureStackTrace() {
    const stack = new Error().stack;
    return stack ? stack.split('\n').slice(2, 6) : [];
  }

  storeMonitoringData(data) {
    // Store monitoring data for analysis
    // In production, this would go to a database or monitoring system
  }
}

// Export singleton instance
export const memoryLeakPrevention = new MemoryLeakPrevention();
