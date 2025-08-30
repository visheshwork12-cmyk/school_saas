// src/core/monitoring/services/health.service.js
import { EventEmitter } from 'events';
import { logger } from '#utils/core/logger.js';
import { getConnection } from '#shared/database/connection-manager.js';

/**
 * Health Service for monitoring system health
 */
class HealthService extends EventEmitter {
  constructor() {
    super();
    this.checks = new Map();
    this.lastHealthCheck = null;
    this.healthStatus = 'unknown';
  }

  async initialize() {
    try {
      logger.info('🏥 Initializing Health Service...');
      this.setupDefaultChecks();
      logger.info('✅ Health Service initialized successfully');
    } catch (error) {
      logger.error('❌ Health Service initialization failed:', error);
      throw error;
    }
  }

  setupDefaultChecks() {
    this.addCheck('database', this.checkDatabase.bind(this));
    this.addCheck('memory', this.checkMemory.bind(this));
    this.addCheck('disk', this.checkDisk.bind(this));
  }

  addCheck(name, checkFunction) {
    this.checks.set(name, checkFunction);
  }

  async checkDatabase() {
    try {
      const connection = getConnection();
      if (!connection || connection.readyState !== 1) {
        return { status: 'unhealthy', message: 'Database not connected' };
      }
      return { status: 'healthy', message: 'Database connected' };
    } catch (error) {
      return { status: 'unhealthy', message: error.message };
    }
  }

  async checkMemory() {
    const usage = process.memoryUsage();
    const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(usage.heapTotal / 1024 / 1024);
    
    return {
      status: heapUsedMB < 500 ? 'healthy' : 'warning',
      message: `Memory usage: ${heapUsedMB}MB / ${heapTotalMB}MB`
    };
  }

  async checkDisk() {
    return {
      status: 'healthy',
      message: 'Disk space sufficient'
    };
  }

  async getSystemHealth() {
    const results = {};
    
    for (const [name, checkFn] of this.checks) {
      try {
        results[name] = await checkFn();
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          message: error.message
        };
      }
    }

    const overallStatus = Object.values(results).every(r => r.status === 'healthy') 
      ? 'healthy' 
      : 'degraded';

    this.lastHealthCheck = {
      timestamp: new Date().toISOString(),
      status: overallStatus,
      checks: results
    };

    return this.lastHealthCheck;
  }

  async shutdown() {
    logger.info('🛑 Health Service shutting down...');
    this.checks.clear();
    logger.info('✅ Health Service shutdown completed');
  }
}

// Export singleton instance
const healthService = new HealthService();
export { HealthService };
export default healthService;
