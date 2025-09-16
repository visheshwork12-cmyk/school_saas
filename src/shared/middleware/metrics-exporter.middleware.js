// Enhanced metrics exporter for School ERP SaaS alerting
import prometheus from 'prom-client';
import logger from '../utils/core/logger.js';

// Initialize metrics registry
const register = new prometheus.register();

// === DATABASE METRICS ===
const dbConnectionGauge = new prometheus.Gauge({
  name: 'mongodb_up',
  help: 'MongoDB connection status (1 = up, 0 = down)',
  labelNames: ['tenant_id', 'database'],
  registers: [register]
});

const dbQueryDuration = new prometheus.Histogram({
  name: 'mongodb_query_duration_seconds',
  help: 'MongoDB query duration',
  labelNames: ['tenant_id', 'collection', 'operation'],
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// === AUTHENTICATION METRICS ===
const authFailuresCounter = new prometheus.Counter({
  name: 'school_erp_authentication_failures_total',
  help: 'Total authentication failures',
  labelNames: ['tenant_id', 'reason', 'ip', 'user_agent'],
  registers: [register]
});

const authAttemptsCounter = new prometheus.Counter({
  name: 'school_erp_authentication_attempts_total',
  help: 'Total authentication attempts',
  labelNames: ['tenant_id', 'method', 'success'],
  registers: [register]
});

// === FILE UPLOAD METRICS ===
const fileUploadFailuresCounter = new prometheus.Counter({
  name: 'school_erp_file_upload_failures_total',
  help: 'Total file upload failures',
  labelNames: ['tenant_id', 'error_type', 'file_type'],
  registers: [register]
});

const fileUploadDuration = new prometheus.Histogram({
  name: 'school_erp_file_upload_duration_seconds',
  help: 'File upload duration',
  labelNames: ['tenant_id', 'file_size_category'],
  buckets: [1, 5, 10, 30, 60],
  registers: [register]
});

const storageUsageGauge = new prometheus.Gauge({
  name: 'school_erp_storage_usage_bytes',
  help: 'Current storage usage in bytes',
  labelNames: ['tenant_id'],
  registers: [register]
});

const storageQuotaGauge = new prometheus.Gauge({
  name: 'school_erp_storage_quota_bytes',
  help: 'Storage quota in bytes',
  labelNames: ['tenant_id'],
  registers: [register]
});

// === PAYMENT & BILLING METRICS ===
const paymentFailuresCounter = new prometheus.Counter({
  name: 'school_erp_payment_failures_total',
  help: 'Total payment failures',
  labelNames: ['tenant_id', 'type', 'provider', 'reason'],
  registers: [register]
});

const paymentAttemptsCounter = new prometheus.Counter({
  name: 'school_erp_payment_attempts_total',
  help: 'Total payment attempts',
  labelNames: ['tenant_id', 'type', 'provider'],
  registers: [register]
});

const paymentGatewayUpGauge = new prometheus.Gauge({
  name: 'school_erp_payment_gateway_up',
  help: 'Payment gateway status (1 = up, 0 = down)',
  labelNames: ['provider'],
  registers: [register]
});

const subscriptionsExpiringGauge = new prometheus.Gauge({
  name: 'school_erp_subscriptions_expiring_soon',
  help: 'Number of subscriptions expiring soon',
  labelNames: ['days_until_expiry'],
  registers: [register]
});

// === API METRICS ===
const httpRequestsCounter = new prometheus.Counter({
  name: 'school_erp_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'code', 'tenant_id'],
  registers: [register]
});

const httpRequestDuration = new prometheus.Histogram({
  name: 'school_erp_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'tenant_id'],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register]
});

// Middleware to collect metrics
export const metricsCollectorMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const tenantId = req.context?.tenantId || 'unknown';
  
  // Track request
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    const route = req.route?.path || req.path;
    
    // HTTP metrics
    httpRequestsCounter
      .labels(req.method, route, res.statusCode.toString(), tenantId)
      .inc();
    
    httpRequestDuration
      .labels(req.method, route, tenantId)
      .observe(duration);
  });
  
  next();
};

// Database metrics collector
export const recordDbMetrics = {
  connectionStatus: (tenantId, database, isUp) => {
    dbConnectionGauge.labels(tenantId, database).set(isUp ? 1 : 0);
  },
  
  queryDuration: (tenantId, collection, operation, duration) => {
    dbQueryDuration.labels(tenantId, collection, operation).observe(duration);
  }
};

// Authentication metrics
export const recordAuthMetrics = {
  failure: (tenantId, reason, ip, userAgent) => {
    authFailuresCounter.labels(tenantId, reason, ip, userAgent).inc();
  },
  
  attempt: (tenantId, method, success) => {
    authAttemptsCounter.labels(tenantId, method, success ? 'true' : 'false').inc();
  }
};

// File upload metrics
export const recordFileUploadMetrics = {
  failure: (tenantId, errorType, fileType) => {
    fileUploadFailuresCounter.labels(tenantId, errorType, fileType).inc();
  },
  
  duration: (tenantId, fileSizeCategory, duration) => {
    fileUploadDuration.labels(tenantId, fileSizeCategory).observe(duration);
  },
  
  storageUsage: (tenantId, usageBytes, quotaBytes) => {
    storageUsageGauge.labels(tenantId).set(usageBytes);
    storageQuotaGauge.labels(tenantId).set(quotaBytes);
  }
};

// Payment metrics
export const recordPaymentMetrics = {
  failure: (tenantId, type, provider, reason) => {
    paymentFailuresCounter.labels(tenantId, type, provider, reason).inc();
  },
  
  attempt: (tenantId, type, provider) => {
    paymentAttemptsCounter.labels(tenantId, type, provider).inc();
  },
  
  gatewayStatus: (provider, isUp) => {
    paymentGatewayUpGauge.labels(provider).set(isUp ? 1 : 0);
  },
  
  expiringSubscriptions: (daysUntilExpiry, count) => {
    subscriptionsExpiringGauge.labels(daysUntilExpiry.toString()).set(count);
  }
};

// Metrics endpoint
export const getMetrics = () => {
  return register.metrics();
};

// Default Prometheus metrics
prometheus.collectDefaultMetrics({ 
  register,
  prefix: 'school_erp_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

export default register;
