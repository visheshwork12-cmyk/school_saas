// src/infrastructure/cache/warming/cache-warming-service.js
import { logger } from "#utils/core/logger.js";
import { redisClusterManager } from "../redis/redis-cluster-manager.js";
import cron from "node-cron";

/**
 * Cache Warming Service
 * Proactively warms cache with frequently accessed data
 */
export class CacheWarmingService {
  constructor() {
    this.warmingStrategies = new Map();
    this.warmingJobs = new Map();
    this.warmingMetrics = new Map();
    this.initializeWarmingStrategies();
  }

  /**
   * Initialize cache warming strategies
   */
  initializeWarmingStrategies() {
    // User session warming
    this.addWarmingStrategy('USER_SESSIONS', {
      name: 'User Session Warming',
      description: 'Warm cache with active user sessions and preferences',
      schedule: '*/15 * * * *', // Every 15 minutes
      priority: 1,
      warmer: this.warmUserSessions.bind(this)
    });

    // Tenant configuration warming
    this.addWarmingStrategy('TENANT_CONFIG', {
      name: 'Tenant Configuration Warming',
      description: 'Warm cache with tenant settings and configurations',
      schedule: '0 */2 * * *', // Every 2 hours
      priority: 2,
      warmer: this.warmTenantConfigurations.bind(this)
    });

    // Academic data warming
    this.addWarmingStrategy('ACADEMIC_DATA', {
      name: 'Academic Data Warming',
      description: 'Warm cache with frequently accessed academic information',
      schedule: '0 6,12,18 * * *', // 6 AM, 12 PM, 6 PM
      priority: 3,
      warmer: this.warmAcademicData.bind(this)
    });

    // Dashboard metrics warming
    this.addWarmingStrategy('DASHBOARD_METRICS', {
      name: 'Dashboard Metrics Warming',
      description: 'Warm cache with dashboard and analytics data',
      schedule: '*/30 * * * *', // Every 30 minutes
      priority: 4,
      warmer: this.warmDashboardMetrics.bind(this)
    });

    // Static reference data warming
    this.addWarmingStrategy('REFERENCE_DATA', {
      name: 'Reference Data Warming',
      description: 'Warm cache with static reference data (countries, currencies, etc.)',
      schedule: '0 0 * * *', // Daily at midnight
      priority: 5,
      warmer: this.warmReferenceData.bind(this)
    });
  }

  /**
   * Add warming strategy
   */
  addWarmingStrategy(strategyId, strategy) {
    this.warmingStrategies.set(strategyId, {
      id: strategyId,
      ...strategy,
      createdAt: new Date(),
      lastExecution: null,
      executionCount: 0,
      successCount: 0,
      errorCount: 0
    });

    logger.info(`Cache warming strategy added: ${strategyId}`);
  }

  /**
   * Start cache warming service
   */
  startWarmingService() {
    logger.info('Starting cache warming service');

    // Schedule all warming strategies
    for (const [strategyId, strategy] of this.warmingStrategies) {
      this.scheduleWarmingJob(strategyId, strategy);
    }

    // Start immediate warming for critical data
    setImmediate(() => {
      this.performImmediateWarming();
    });

    logger.info(`Cache warming service started with ${this.warmingStrategies.size} strategies`);
  }

  /**
   * Schedule warming job
   */
  scheduleWarmingJob(strategyId, strategy) {
    try {
      const job = cron.schedule(strategy.schedule, async () => {
        await this.executeWarmingStrategy(strategyId);
      }, {
        scheduled: false,
        timezone: process.env.TZ || 'UTC'
      });

      job.start();
      this.warmingJobs.set(strategyId, job);

      logger.info(`Warming job scheduled: ${strategyId} (${strategy.schedule})`);

    } catch (error) {
      logger.error(`Failed to schedule warming job ${strategyId}:`, error);
    }
  }

  /**
   * Execute warming strategy
   */
  async executeWarmingStrategy(strategyId) {
    const strategy = this.warmingStrategies.get(strategyId);
    if (!strategy) return;

    const startTime = Date.now();
    
    try {
      logger.info(`Executing cache warming strategy: ${strategyId}`);

      // Execute the warmer function
      const result = await strategy.warmer();

      const executionTime = Date.now() - startTime;

      // Update strategy metrics
      strategy.lastExecution = new Date();
      strategy.executionCount++;
      strategy.successCount++;

      // Store execution metrics
      this.updateWarmingMetrics(strategyId, {
        executionTime,
        success: true,
        itemsWarmed: result.itemsWarmed || 0,
        cacheHits: result.cacheHits || 0,
        errors: []
      });

      logger.info(`Cache warming completed: ${strategyId}`, {
        executionTime,
        itemsWarmed: result.itemsWarmed
      });

    } catch (error) {
      const executionTime = Date.now() - startTime;

      // Update error metrics
      strategy.errorCount++;
      
      this.updateWarmingMetrics(strategyId, {
        executionTime,
        success: false,
        error: error.message,
        errors: [error.message]
      });

      logger.error(`Cache warming failed: ${strategyId}`, error);
    }
  }

  /**
   * Perform immediate warming for critical data
   */
  async performImmediateWarming() {
    logger.info('Performing immediate cache warming for critical data');

    const criticalStrategies = ['TENANT_CONFIG', 'REFERENCE_DATA'];
    
    for (const strategyId of criticalStrategies) {
      try {
        await this.executeWarmingStrategy(strategyId);
      } catch (error) {
        logger.error(`Immediate warming failed for ${strategyId}:`, error);
      }
    }
  }

  /**
   * Warm user sessions
   */
  async warmUserSessions() {
    const redis = redisClusterManager.getCluster();
    let itemsWarmed = 0;

    try {
      // Get active sessions from last 24 hours
      const activeSessions = await this.getActiveUserSessions();

      for (const session of activeSessions) {
        try {
          // Warm user profile
          await this.warmUserProfile(session.userId, session.tenantId);
          
          // Warm user permissions
          await this.warmUserPermissions(session.userId, session.tenantId);
          
          // Warm user preferences
          await this.warmUserPreferences(session.userId);

          itemsWarmed++;

        } catch (error) {
          logger.warn(`Failed to warm session for user ${session.userId}:`, error.message);
        }
      }

      return { itemsWarmed, sessionCount: activeSessions.length };

    } catch (error) {
      logger.error('User session warming failed:', error);
      throw error;
    }
  }

  /**
   * Warm tenant configurations
   */
  async warmTenantConfigurations() {
    const redis = redisClusterManager.getCluster();
    let itemsWarmed = 0;

    try {
      // Get all active tenants
      const activeTenants = await this.getActiveTenants();

      for (const tenant of activeTenants) {
        try {
          // Warm tenant settings
          const tenantConfig = await this.getTenantConfiguration(tenant.id);
          await redis.setex(
            `tenant:config:${tenant.id}`,
            3600, // 1 hour
            JSON.stringify(tenantConfig)
          );

          // Warm tenant features
          const tenantFeatures = await this.getTenantFeatures(tenant.id);
          await redis.setex(
            `tenant:features:${tenant.id}`,
            7200, // 2 hours
            JSON.stringify(tenantFeatures)
          );

          // Warm tenant limits
          const tenantLimits = await this.getTenantLimits(tenant.id);
          await redis.setex(
            `tenant:limits:${tenant.id}`,
            3600, // 1 hour
            JSON.stringify(tenantLimits)
          );

          itemsWarmed += 3;

        } catch (error) {
          logger.warn(`Failed to warm config for tenant ${tenant.id}:`, error.message);
        }
      }

      return { itemsWarmed, tenantCount: activeTenants.length };

    } catch (error) {
      logger.error('Tenant configuration warming failed:', error);
      throw error;
    }
  }

  /**
   * Warm academic data
   */
  async warmAcademicData() {
    const redis = redisClusterManager.getCluster();
    let itemsWarmed = 0;

    try {
      // Get active academic sessions
      const academicSessions = await this.getActiveAcademicSessions();

      for (const session of academicSessions) {
        try {
          // Warm class schedules
          const schedules = await this.getClassSchedules(session.tenantId, session.id);
          await redis.setex(
            `academic:schedules:${session.tenantId}:${session.id}`,
            1800, // 30 minutes
            JSON.stringify(schedules)
          );

          // Warm student enrollments
          const enrollments = await this.getStudentEnrollments(session.tenantId, session.id);
          await redis.setex(
            `academic:enrollments:${session.tenantId}:${session.id}`,
            3600, // 1 hour
            JSON.stringify(enrollments)
          );

          // Warm teacher assignments
          const assignments = await this.getTeacherAssignments(session.tenantId, session.id);
          await redis.setex(
            `academic:assignments:${session.tenantId}:${session.id}`,
            3600, // 1 hour
            JSON.stringify(assignments)
          );

          itemsWarmed += 3;

        } catch (error) {
          logger.warn(`Failed to warm academic data for session ${session.id}:`, error.message);
        }
      }

      return { itemsWarmed, sessionCount: academicSessions.length };

    } catch (error) {
      logger.error('Academic data warming failed:', error);
      throw error;
    }
  }

  /**
   * Warm dashboard metrics
   */
  async warmDashboardMetrics() {
    const redis = redisClusterManager.getCluster();
    let itemsWarmed = 0;

    try {
      const activeTenants = await this.getActiveTenants();

      for (const tenant of activeTenants) {
        try {
          // Warm student statistics
          const studentStats = await this.getStudentStatistics(tenant.id);
          await redis.setex(
            `dashboard:student_stats:${tenant.id}`,
            900, // 15 minutes
            JSON.stringify(studentStats)
          );

          // Warm attendance metrics
          const attendanceMetrics = await this.getAttendanceMetrics(tenant.id);
          await redis.setex(
            `dashboard:attendance:${tenant.id}`,
            1800, // 30 minutes
            JSON.stringify(attendanceMetrics)
          );

          // Warm financial summary
          const financialSummary = await this.getFinancialSummary(tenant.id);
          await redis.setex(
            `dashboard:financial:${tenant.id}`,
            3600, // 1 hour
            JSON.stringify(financialSummary)
          );

          itemsWarmed += 3;

        } catch (error) {
          logger.warn(`Failed to warm dashboard metrics for tenant ${tenant.id}:`, error.message);
        }
      }

      return { itemsWarmed, tenantCount: activeTenants.length };

    } catch (error) {
      logger.error('Dashboard metrics warming failed:', error);
      throw error;
    }
  }

  /**
   * Warm reference data
   */
  async warmReferenceData() {
    const redis = redisClusterManager.getCluster();
    let itemsWarmed = 0;

    try {
      // Warm countries
      const countries = await this.getReferenceCountries();
      await redis.setex('reference:countries', 86400, JSON.stringify(countries));
      itemsWarmed++;

      // Warm currencies
      const currencies = await this.getReferenceCurrencies();
      await redis.setex('reference:currencies', 86400, JSON.stringify(currencies));
      itemsWarmed++;

      // Warm time zones
      const timeZones = await this.getReferenceTimeZones();
      await redis.setex('reference:timezones', 86400, JSON.stringify(timeZones));
      itemsWarmed++;

      // Warm system configurations
      const systemConfig = await this.getSystemConfigurations();
      await redis.setex('system:config', 3600, JSON.stringify(systemConfig));
      itemsWarmed++;

      return { itemsWarmed };

    } catch (error) {
      logger.error('Reference data warming failed:', error);
      throw error;
    }
  }

  /**
   * Get warming service statistics
   */
  getWarmingStatistics() {
    const stats = {
      strategies: {},
      summary: {
        totalStrategies: this.warmingStrategies.size,
        activeJobs: this.warmingJobs.size,
        totalExecutions: 0,
        totalSuccesses: 0,
        totalErrors: 0,
        averageExecutionTime: 0
      }
    };

    for (const [strategyId, strategy] of this.warmingStrategies) {
      const metrics = this.warmingMetrics.get(strategyId) || {};
      
      stats.strategies[strategyId] = {
        name: strategy.name,
        schedule: strategy.schedule,
        lastExecution: strategy.lastExecution,
        executionCount: strategy.executionCount,
        successCount: strategy.successCount,
        errorCount: strategy.errorCount,
        successRate: strategy.executionCount > 0 
          ? (strategy.successCount / strategy.executionCount) * 100 
          : 0,
        averageExecutionTime: metrics.averageExecutionTime || 0
      };

      stats.summary.totalExecutions += strategy.executionCount;
      stats.summary.totalSuccesses += strategy.successCount;
      stats.summary.totalErrors += strategy.errorCount;
    }

    return stats;
  }

  // Helper methods for data retrieval (implement based on your data models)
  async getActiveUserSessions() {
    // Implementation depends on your session storage
    return [];
  }

  async getActiveTenants() {
    // Implementation depends on your tenant model
    return [];
  }

  updateWarmingMetrics(strategyId, metrics) {
    if (!this.warmingMetrics.has(strategyId)) {
      this.warmingMetrics.set(strategyId, {
        totalExecutions: 0,
        averageExecutionTime: 0,
        totalItemsWarmed: 0
      });
    }

    const existingMetrics = this.warmingMetrics.get(strategyId);
    existingMetrics.totalExecutions++;
    existingMetrics.averageExecutionTime = (
      existingMetrics.averageExecutionTime + metrics.executionTime
    ) / 2;
    existingMetrics.totalItemsWarmed += metrics.itemsWarmed || 0;
  }
}

// Export singleton instance
export const cacheWarmingService = new CacheWarmingService();
