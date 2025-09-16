// Service to integrate application metrics with alerting
import { recordAuthMetrics, recordPaymentMetrics, recordFileUploadMetrics, recordDbMetrics } from '../../shared/middleware/metrics-exporter.middleware.js';
import logger from '../../shared/utils/core/logger.js';

export class MetricsService {
  
  // Database connection monitoring
  static monitorDatabaseConnection(tenantId, database = 'default') {
    const mongoose = require('mongoose');
    const isConnected = mongoose.connection.readyState === 1;
    
    recordDbMetrics.connectionStatus(tenantId, database, isConnected);
    
    if (!isConnected) {
      logger.error('Database connection failed', { tenantId, database });
    }
  }
  
  // Authentication failure tracking
  static recordAuthFailure(tenantId, reason, req) {
    const ip = req.ip || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    
    recordAuthMetrics.failure(tenantId, reason, ip, userAgent);
    recordAuthMetrics.attempt(tenantId, 'password', false);
    
    logger.warn('Authentication failure recorded', { 
      tenantId, 
      reason, 
      ip,
      userAgent: userAgent.substring(0, 100) // Truncate for security
    });
  }
  
  // File upload failure tracking
  static recordFileUploadFailure(tenantId, error, fileType = 'unknown') {
    const errorType = error.code || error.name || 'unknown';
    
    recordFileUploadMetrics.failure(tenantId, errorType, fileType);
    
    logger.error('File upload failure recorded', {
      tenantId,
      errorType,
      fileType,
      error: error.message
    });
  }
  
  // Payment failure tracking
  static recordPaymentFailure(tenantId, paymentData, error) {
    const type = paymentData.type || 'subscription';
    const provider = paymentData.provider || 'stripe';
    const reason = error.code || error.type || 'unknown';
    
    recordPaymentMetrics.failure(tenantId, type, provider, reason);
    recordPaymentMetrics.attempt(tenantId, type, provider);
    
    logger.error('Payment failure recorded', {
      tenantId,
      type,
      provider,
      reason,
      amount: paymentData.amount,
      currency: paymentData.currency
    });
  }
  
  // Storage monitoring
  static updateStorageMetrics(tenantId, usageBytes, quotaBytes) {
    recordFileUploadMetrics.storageUsage(tenantId, usageBytes, quotaBytes);
    
    const usagePercentage = (usageBytes / quotaBytes) * 100;
    
    if (usagePercentage > 90) {
      logger.warn('Storage quota nearly exceeded', {
        tenantId,
        usagePercentage: usagePercentage.toFixed(2),
        usageBytes,
        quotaBytes
      });
    }
  }
  
  // Periodic metrics collection
  static async collectPeriodicMetrics() {
    try {
      // Check payment gateway status
      await this.checkPaymentGatewayStatus();
      
      // Check expiring subscriptions
      await this.checkExpiringSubscriptions();
      
      // Update tenant storage metrics
      await this.updateAllTenantStorageMetrics();
      
    } catch (error) {
      logger.error('Periodic metrics collection failed', error);
    }
  }
  
  static async checkPaymentGatewayStatus() {
    try {
      // Mock Stripe health check
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      await stripe.accounts.retrieve();
      
      recordPaymentMetrics.gatewayStatus('stripe', true);
    } catch (error) {
      recordPaymentMetrics.gatewayStatus('stripe', false);
      logger.error('Stripe health check failed', error);
    }
  }
  
  static async checkExpiringSubscriptions() {
    // Implementation to check subscriptions expiring in next 7 days
    const expiringCount = 0; // Placeholder - implement actual query
    recordPaymentMetrics.expiringSubscriptions(7, expiringCount);
  }
}

// Schedule periodic metrics collection
setInterval(() => {
  MetricsService.collectPeriodicMetrics();
}, 60000); // Every minute
