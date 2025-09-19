// src/infrastructure/cache/invalidation/cache-invalidation-manager.js
import { logger } from "#utils/core/logger.js";
import { multiLevelCacheManager } from "../multi-level/multi-level-cache-manager.js";
import { EventEmitter } from "events";

/**
 * Cache Invalidation Manager
 * Implements various cache invalidation patterns and strategies
 */
export class CacheInvalidationManager extends EventEmitter {
  constructor() {
    super();
    this.invalidationStrategies = new Map();
    this.invalidationRules = new Map();
    this.dependencyGraph = new Map();
    this.invalidationQueue = [];
    this.isProcessing = false;
    this.initializeInvalidationStrategies();
  }

  /**
   * Initialize invalidation strategies
   */
  initializeInvalidationStrategies() {
    // Time-based invalidation (TTL)
    this.addInvalidationStrategy('TTL', {
      name: 'Time-To-Live Invalidation',
      execute: this.executeTTLInvalidation.bind(this)
    });

    // Tag-based invalidation
    this.addInvalidationStrategy('TAG_BASED', {
      name: 'Tag-based Invalidation',
      execute: this.executeTagBasedInvalidation.bind(this)
    });

    // Event-driven invalidation
    this.addInvalidationStrategy('EVENT_DRIVEN', {
      name: 'Event-driven Invalidation',
      execute: this.executeEventDrivenInvalidation.bind(this)
    });

    // Dependency-based invalidation
    this.addInvalidationStrategy('DEPENDENCY_BASED', {
      name: 'Dependency-based Invalidation',
      execute: this.executeDependencyBasedInvalidation.bind(this)
    });

    // Write-through invalidation
    this.addInvalidationStrategy('WRITE_THROUGH', {
      name: 'Write-through Invalidation',
      execute: this.executeWriteThroughInvalidation.bind(this)
    });

    // Manual invalidation
    this.addInvalidationStrategy('MANUAL', {
      name: 'Manual Invalidation',
      execute: this.executeManualInvalidation.bind(this)
    });
  }

  /**
   * Add invalidation strategy
   */
  addInvalidationStrategy(strategyId, strategy) {
    this.invalidationStrategies.set(strategyId, strategy);
    logger.info(`Cache invalidation strategy added: ${strategyId}`);
  }

  /**
   * Register invalidation rule
   */
  registerInvalidationRule(ruleId, rule) {
    this.invalidationRules.set(ruleId, {
      id: ruleId,
      ...rule,
      createdAt: new Date(),
      executionCount: 0,
      lastExecuted: null
    });

    logger.info(`Cache invalidation rule registered: ${ruleId}`);
  }

  /**
   * Set up common invalidation rules for School ERP
   */
  setupERPInvalidationRules() {
    // User profile changes
    this.registerInvalidationRule('USER_PROFILE_CHANGED', {
      event: 'user.profile.updated',
      strategy: 'TAG_BASED',
      tags: ['user_profile', 'user_permissions'],
      pattern: 'user:*:${userId}',
      cascade: true
    });

    // Tenant configuration changes
    this.registerInvalidationRule('TENANT_CONFIG_CHANGED', {
      event: 'tenant.config.updated',
      strategy: 'TAG_BASED',
      tags: ['tenant_config', 'tenant_features', 'tenant_limits'],
      pattern: 'tenant:*:${tenantId}',
      cascade: true
    });

    // Academic session changes
    this.registerInvalidationRule('ACADEMIC_SESSION_CHANGED', {
      event: 'academic.session.updated',
      strategy: 'DEPENDENCY_BASED',
      dependencies: ['schedules', 'enrollments', 'assignments'],
      pattern: 'academic:*:${tenantId}:${sessionId}',
      cascade: true
    });

    // Student enrollment changes
    this.registerInvalidationRule('STUDENT_ENROLLMENT_CHANGED', {
      event: 'student.enrollment.changed',
      strategy: 'TAG_BASED',
      tags: ['student_enrollment', 'class_list', 'attendance'],
      pattern: 'student:*:${studentId}',
      cascade: true
    });

    // Grade/marks updates
    this.registerInvalidationRule('GRADES_UPDATED', {
      event: 'grades.updated',
      strategy: 'TAG_BASED',
      tags: ['student_grades', 'class_performance', 'reports'],
      pattern: 'grades:*:${studentId}',
      cascade: false
    });

    // Fee payment updates
    this.registerInvalidationRule('FEE_PAYMENT_UPDATED', {
      event: 'fee.payment.updated',
      strategy: 'TAG_BASED',
      tags: ['fee_status', 'financial_reports'],
      pattern: 'fee:*:${studentId}',
      cascade: true
    });

    // Timetable changes
    this.registerInvalidationRule('TIMETABLE_CHANGED', {
      event: 'timetable.updated',
      strategy: 'TAG_BASED',
      tags: ['timetable', 'schedule'],
      pattern: 'timetable:*:${tenantId}',
      cascade: true
    });
  }

  /**
   * Invalidate cache based on event
   */
  async invalidateByEvent(eventName, eventData) {
    try {
      logger.debug(`Processing cache invalidation for event: ${eventName}`, eventData);

      // Find matching rules
      const matchingRules = this.findMatchingRules(eventName);

      for (const rule of matchingRules) {
        await this.executeInvalidationRule(rule, eventData);
      }

      // Emit invalidation completed event
      this.emit('invalidationCompleted', {
        event: eventName,
        rulesExecuted: matchingRules.length,
        timestamp: new Date()
      });

    } catch (error) {
      logger.error(`Cache invalidation failed for event ${eventName}:`, error);
      throw error;
    }
  }

  /**
   * Find rules matching an event
   */
  findMatchingRules(eventName) {
    const matchingRules = [];

    for (const [ruleId, rule] of this.invalidationRules) {
      if (this.eventMatches(eventName, rule.event)) {
        matchingRules.push(rule);
      }
    }

    return matchingRules;
  }

  /**
   * Execute invalidation rule
   */
  async executeInvalidationRule(rule, eventData) {
    try {
      const strategy = this.invalidationStrategies.get(rule.strategy);
      if (!strategy) {
        throw new Error(`Unknown invalidation strategy: ${rule.strategy}`);
      }

      // Prepare invalidation context
      const context = {
        rule,
        eventData,
        patterns: this.generateInvalidationPatterns(rule, eventData),
        tags: rule.tags || [],
        dependencies: rule.dependencies || []
      };

      // Execute strategy
      await strategy.execute(context);

      // Update rule metrics
      rule.executionCount++;
      rule.lastExecuted = new Date();

      logger.debug(`Cache invalidation rule executed: ${rule.id}`);

    } catch (error) {
      logger.error(`Failed to execute invalidation rule ${rule.id}:`, error);
      throw error;
    }
  }

  /**
   * Generate invalidation patterns from rule and event data
   */
  generateInvalidationPatterns(rule, eventData) {
    if (!rule.pattern) return [];

    const patterns = [];
    let pattern = rule.pattern;

    // Replace placeholders with event data
    for (const [key, value] of Object.entries(eventData)) {
      const placeholder = `\${${key}}`;
      pattern = pattern.replace(new RegExp(placeholder, 'g'), value);
    }

    patterns.push(pattern);

    return patterns;
  }

  /**
   * Execute TTL invalidation
   */
  async executeTTLInvalidation(context) {
    // TTL invalidation is handled automatically by cache layers
    logger.debug('TTL invalidation - handled automatically by cache layers');
  }

  /**
   * Execute tag-based invalidation
   */
  async executeTagBasedInvalidation(context) {
    const { tags, patterns } = context;

    // Invalidate by tags
    for (const tag of tags) {
      await multiLevelCacheManager.invalidatePattern(`*:${tag}:*`);
      logger.debug(`Tag-based invalidation executed for tag: ${tag}`);
    }

    // Invalidate by patterns
    for (const pattern of patterns) {
      await multiLevelCacheManager.invalidatePattern(pattern);
      logger.debug(`Pattern-based invalidation executed: ${pattern}`);
    }
  }

  /**
   * Execute event-driven invalidation
   */
  async executeEventDrivenInvalidation(context) {
    const { patterns } = context;

    for (const pattern of patterns) {
      await multiLevelCacheManager.invalidatePattern(pattern);
      logger.debug(`Event-driven invalidation executed: ${pattern}`);
    }
  }

  /**
   * Execute dependency-based invalidation
   */
  async executeDependencyBasedInvalidation(context) {
    const { dependencies, eventData, patterns } = context;

    // Invalidate direct patterns
    for (const pattern of patterns) {
      await multiLevelCacheManager.invalidatePattern(pattern);
    }

    // Invalidate dependent caches
    for (const dependency of dependencies) {
      const dependentPatterns = this.resolveDependencyPatterns(dependency, eventData);
      for (const pattern of dependentPatterns) {
        await multiLevelCacheManager.invalidatePattern(pattern);
        logger.debug(`Dependency invalidation executed: ${dependency} -> ${pattern}`);
      }
    }
  }

  /**
   * Execute write-through invalidation
   */
  async executeWriteThroughInvalidation(context) {
    const { patterns } = context;

    // For write-through, we invalidate immediately and let the next read refresh the cache
    for (const pattern of patterns) {
      await multiLevelCacheManager.invalidatePattern(pattern);
      logger.debug(`Write-through invalidation executed: ${pattern}`);
    }
  }

  /**
   * Execute manual invalidation
   */
  async executeManualInvalidation(context) {
    const { patterns } = context;

    for (const pattern of patterns) {
      await multiLevelCacheManager.invalidatePattern(pattern);
      logger.debug(`Manual invalidation executed: ${pattern}`);
    }
  }

  /**
   * Invalidate cache by tag
   */
  async invalidateByTag(tag) {
    const context = {
      rule: { strategy: 'TAG_BASED' },
      eventData: {},
      patterns: [`*:${tag}:*`],
      tags: [tag],
      dependencies: []
    };

    await this.executeTagBasedInvalidation(context);
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidateByPattern(pattern) {
    await multiLevelCacheManager.invalidatePattern(pattern);
    logger.info(`Cache invalidated by pattern: ${pattern}`);
  }

  /**
   * Set up cache dependency
   */
  setupDependency(parentKey, dependentKeys) {
    if (!this.dependencyGraph.has(parentKey)) {
      this.dependencyGraph.set(parentKey, new Set());
    }

    const dependencies = this.dependencyGraph.get(parentKey);
    dependentKeys.forEach(key => dependencies.add(key));

    logger.debug(`Cache dependency set up: ${parentKey} -> [${dependentKeys.join(', ')}]`);
  }

  /**
   * Queue invalidation for batch processing
   */
  queueInvalidation(invalidationTask) {
    this.invalidationQueue.push({
      ...invalidationTask,
      queuedAt: new Date()
    });

    // Process queue if not already processing
    if (!this.isProcessing) {
      setImmediate(() => this.processInvalidationQueue());
    }
  }

  /**
   * Process invalidation queue
   */
  async processInvalidationQueue() {
    if (this.isProcessing || this.invalidationQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.invalidationQueue.length > 0) {
        const task = this.invalidationQueue.shift();
        
        try {
          await this.executeInvalidationTask(task);
        } catch (error) {
          logger.error('Failed to execute invalidation task:', error);
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute invalidation task
   */
  async executeInvalidationTask(task) {
    switch (task.type) {
      case 'pattern':
        await this.invalidateByPattern(task.pattern);
        break;
      case 'tag':
        await this.invalidateByTag(task.tag);
        break;
      case 'event':
        await this.invalidateByEvent(task.event, task.data);
        break;
      default:
        logger.warn(`Unknown invalidation task type: ${task.type}`);
    }
  }

  /**
   * Get invalidation statistics
   */
  getInvalidationStatistics() {
    const stats = {
      strategies: this.invalidationStrategies.size,
      rules: this.invalidationRules.size,
      dependencies: this.dependencyGraph.size,
      queueSize: this.invalidationQueue.length,
      ruleExecutions: {}
    };

    // Collect rule execution stats
    for (const [ruleId, rule] of this.invalidationRules) {
      stats.ruleExecutions[ruleId] = {
        executionCount: rule.executionCount,
        lastExecuted: rule.lastExecuted
      };
    }

    return stats;
  }

  // Helper methods
  eventMatches(eventName, ruleEvent) {
    if (ruleEvent === eventName) return true;
    
    // Support wildcard matching
    const regexPattern = ruleEvent.replace(/\*/g, '.*');
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(eventName);
  }

  resolveDependencyPatterns(dependency, eventData) {
    // This would resolve dependency patterns based on your specific data model
    // For now, return a simple pattern
    return [`${dependency}:*:${eventData.tenantId || '*'}`];
  }
}

// Export singleton instance
export const cacheInvalidationManager = new CacheInvalidationManager();
