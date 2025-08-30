// src/core/monitoring/services/metrics.service.js
import { logger } from '#utils/core/logger.js';

/**
 * Metrics Service for collecting and exposing application metrics
 */
class MetricsService {
  constructor() {
    this.metrics = new Map();
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
  }

  async initialize() {
    try {
      logger.info('📊 Initializing Metrics Service...');
      this.setupDefaultMetrics();
      logger.info('✅ Metrics Service initialized successfully');
    } catch (error) {
      logger.error('❌ Metrics Service initialization failed:', error);
      throw error;
    }
  }

  setupDefaultMetrics() {
    // Initialize default counters
    this.counters.set('http_requests_total', 0);
    this.counters.set('database_queries_total', 0);
    
    // Initialize default gauges
    this.gauges.set('memory_usage_bytes', 0);
    this.gauges.set('cpu_usage_percent', 0);
  }

  incrementCounter(name, value = 1, labels = {}) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  setGauge(name, value, labels = {}) {
    this.gauges.set(name, value);
  }

  recordHistogram(name, value, labels = {}) {
    if (!this.histograms.has(name)) {
      this.histograms.set(name, []);
    }
    this.histograms.get(name).push(value);
  }

  async getMetrics() {
    let output = '';
    
    // Export counters
    for (const [name, value] of this.counters) {
      output += `# TYPE ${name} counter\n`;
      output += `${name} ${value}\n`;
    }
    
    // Export gauges
    for (const [name, value] of this.gauges) {
      output += `# TYPE ${name} gauge\n`;
      output += `${name} ${value}\n`;
    }
    
    return output;
  }

  async shutdown() {
    logger.info('🛑 Metrics Service shutting down...');
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    logger.info('✅ Metrics Service shutdown completed');
  }
}

// Export singleton instance
const metricsService = new MetricsService();
export { MetricsService };
export default metricsService;
