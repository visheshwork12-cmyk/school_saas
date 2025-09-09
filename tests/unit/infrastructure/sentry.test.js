import { jest } from '@jest/globals';
import * as Sentry from '@sentry/node';
import { initializeSentry, captureException, captureMessage } from '#infrastructure/monitoring/sentry.config.js';

// Mock Sentry
jest.mock('@sentry/node');

describe('Sentry Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should initialize Sentry with correct configuration', () => {
    initializeSentry();
    
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: expect.any(String),
        environment: expect.any(String),
        integrations: expect.any(Array),
        tracesSampleRate: expect.any(Number),
      })
    );
  });

  test('should capture exceptions with context', () => {
    const error = new Error('Test error');
    const context = { tenantId: 'test-tenant', userId: 'test-user' };
    
    captureException(error, context);
    
    expect(Sentry.withScope).toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  test('should capture messages with context', () => {
    const message = 'Test message';
    const context = { operation: 'test' };
    
    captureMessage(message, 'info', context);
    
    expect(Sentry.withScope).toHaveBeenCalled();
    expect(Sentry.captureMessage).toHaveBeenCalledWith(message, 'info');
  });
});