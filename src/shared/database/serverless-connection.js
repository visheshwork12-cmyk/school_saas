// src/shared/database/serverless-connection.js - Serverless-optimized DB connection
import mongoose from 'mongoose';
import { logger } from '#utils/core/logger.js';

// Global connection cache for serverless functions
let cachedConnection = null;
let isConnecting = false;

/**
 * Serverless-optimized MongoDB connection with caching
 * Prevents connection pool exhaustion in serverless environments
 */
export async function connectToDatabase(config, tenantId = 'default') {
  // Return cached connection if available and connected
  if (cachedConnection && cachedConnection.readyState === 1) {
    logger.debug('Using cached database connection', { tenantId });
    return cachedConnection;
  }

  // Prevent multiple simultaneous connection attempts
  if (isConnecting) {
    await waitForConnection();
    return cachedConnection;
  }

  isConnecting = true;

  try {
    const uri = config.mongo?.uri || config.mongodb?.uri || config.uri;
    
    if (!uri) {
      throw new Error('MongoDB URI is missing in configuration');
    }

    // Serverless-optimized connection options
    const options = {
      // Connection pool optimized for serverless
      maxPoolSize: 1, // Single connection for serverless
      minPoolSize: 0,
      maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
      serverSelectionTimeoutMS: 5000, // Fast timeout for serverless
      socketTimeoutMS: 30000,
      connectTimeoutMS: 10000,
      
      // Disable buffering to prevent memory issues
      bufferCommands: false,
      bufferMaxEntries: 0,
      
      // Connection efficiency
      heartbeatFrequencyMS: 30000,
      retryWrites: true,
      retryReads: true,
      readPreference: 'primaryPreferred',
      
      // Serverless-specific optimizations
      family: 4, // IPv4
      keepAlive: false, // Disable for serverless
      
      // Application name for monitoring
      appName: `school-erp-serverless-${tenantId}`
    };

    logger.info('Creating serverless database connection', {
      tenantId,
      uri: uri.replace(/:\/\/.*@/, '://***:***@')
    });

    // Create connection with timeout
    const connection = await Promise.race([
      mongoose.createConnection(uri, options).asPromise(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout')), 15000)
      )
    ]);

    // Cache the connection
    cachedConnection = connection;

    // Set up connection event handlers
    setupConnectionEventHandlers(connection, tenantId);

    logger.info('✅ Serverless database connection established', { tenantId });
    
    return connection;

  } catch (error) {
    logger.error('❌ Serverless database connection failed', {
      tenantId,
      error: error.message
    });
    throw error;
  } finally {
    isConnecting = false;
  }
}

/**
 * Wait for ongoing connection attempt to complete
 */
async function waitForConnection() {
  let attempts = 0;
  const maxAttempts = 50; // 5 seconds max wait
  
  while (isConnecting && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 100));
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Connection wait timeout');
  }
}

/**
 * Setup connection event handlers for monitoring
 */
function setupConnectionEventHandlers(connection, tenantId) {
  connection.on('connected', () => {
    logger.debug('Database connected event', { tenantId });
  });

  connection.on('error', (error) => {
    logger.error('Database connection error', {
      tenantId,
      error: error.message
    });
    // Clear cache on error
    if (cachedConnection === connection) {
      cachedConnection = null;
    }
  });

  connection.on('disconnected', () => {
    logger.warn('Database disconnected', { tenantId });
    // Clear cache on disconnect
    if (cachedConnection === connection) {
      cachedConnection = null;
    }
  });

  connection.on('close', () => {
    logger.debug('Database connection closed', { tenantId });
    if (cachedConnection === connection) {
      cachedConnection = null;
    }
  });
}

/**
 * Get cached connection if available
 */
export function getCachedConnection() {
  return cachedConnection && cachedConnection.readyState === 1 ? cachedConnection : null;
}

/**
 * Close connection (for cleanup)
 */
export async function closeConnection() {
  if (cachedConnection) {
    try {
      await cachedConnection.close();
      cachedConnection = null;
      logger.info('Database connection closed');
    } catch (error) {
      logger.error('Error closing database connection', { error: error.message });
    }
  }
}

/**
 * Get connection health status
 */
export function getConnectionHealth() {
  if (!cachedConnection) {
    return { healthy: false, status: 'not_connected' };
  }

  const readyStates = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };

  return {
    healthy: cachedConnection.readyState === 1,
    status: readyStates[cachedConnection.readyState],
    host: cachedConnection.host,
    port: cachedConnection.port,
    name: cachedConnection.name
  };
}
