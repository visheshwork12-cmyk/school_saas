import express from 'express';
import * as Sentry from '@sentry/node';
import { SentryBusinessMetrics } from '#infrastructure/monitoring/sentry-business-metrics.js';
import { captureException, captureMessage } from '#infrastructure/monitoring/sentry.config.js';

const router = express.Router();

// Test error capture
router.get('/test-error', (req, res) => {
  try {
    throw new Error('This is a test error');
  } catch (error) {
    captureException(error, {
      tenantId: req.context?.tenantId,
      testEndpoint: true,
    });
    res.json({ message: 'Error captured in Sentry' });
  }
});

// Test message capture
router.get('/test-message', (req, res) => {
  captureMessage('This is a test message from Sentry integration', 'info', {
    tenantId: req.context?.tenantId,
    testEndpoint: true,
  });
  res.json({ message: 'Message captured in Sentry' });
});

// Test business metrics
router.post('/test-business-metrics', (req, res) => {
  const { event, tenantId } = req.body;
  
  SentryBusinessMetrics.trackFeatureUsage('test_feature', tenantId, req.user?._id);
  SentryBusinessMetrics.trackUserActivity('test_activity', req.user?._id, tenantId);
  
  res.json({ message: 'Business metrics tracked' });
});

// Test performance monitoring
router.get('/test-performance', async (_req, res) => {
  await Sentry.startSpan({
    name: 'test-performance-operation',
    op: 'test.performance',
  }, async () => {
    // Simulate work
    await new Promise(resolve => setTimeout(resolve, 100));
    res.json({ message: 'Performance test completed' });
  });
});

export default router;