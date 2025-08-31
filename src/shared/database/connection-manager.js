// src/shared/database/connection-manager.js - Production-ready MongoDB Connection Manager
import mongoose from "mongoose";
import { EventEmitter } from "events";
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { BusinessException } from "#shared/exceptions/business.exception.js";
/**
 * Enhanced Database Connection Manager with advanced features
 * Features:
 * - Singleton pattern with proper private fields
 * - Multi-tenant connection management
 * - Connection pooling optimization
 * - Health monitoring and metrics
 * - Automatic reconnection with exponential backoff
 * - Connection lifecycle management
 * - Performance monitoring
 * - Graceful shutdown handling
 */
class DatabaseConnectionManager extends EventEmitter {
  // Private static instance for singleton pattern
  static #instance = null;

  // Private instance fields
  #connections = new Map();
  #connectionConfigs = new Map();
  #reconnectTimers = new Map();
  #healthCheckTimers = new Map();
  #isInitialized = false;
  #isShuttingDown = false;
  #maxRetryAttempts = 5;
  #baseRetryDelay = 1000; // 1 second
  #maxRetryDelay = 30000; // 30 seconds
  #healthCheckInterval = 30000; // 30 seconds
  #connectionMetrics = new Map();

  /**
   * Private constructor to enforce singleton pattern
   */
  constructor() {
    super();

    if (DatabaseConnectionManager.#instance) {
      return DatabaseConnectionManager.#instance;
    }

    this.#connections = new Map();
    this.#connectionConfigs = new Map();
    this.#reconnectTimers = new Map();
    this.#healthCheckTimers = new Map();
    this.#connectionMetrics = new Map();
    this.#isInitialized = true;

    // Set max listeners to prevent memory leak warnings
    this.setMaxListeners(100);

    // Configure mongoose global settings
    mongoose.set("strictQuery", true);
    mongoose.set("autoIndex", false); // Don't build indexes in production

    DatabaseConnectionManager.#instance = this;
  }

  /**
   * Get singleton instance
   * @returns {DatabaseConnectionManager}
   */
  static getInstance() {
    if (!DatabaseConnectionManager.#instance) {
      DatabaseConnectionManager.#instance = new DatabaseConnectionManager();
    }
    return DatabaseConnectionManager.#instance;
  }

  /**
   * Enhanced connection method with retry logic and health monitoring
   * @param {Object} config - Database configuration
   * @param {string} tenantId - Tenant identifier
   * @returns {Promise<mongoose.Connection>}
   */
  async connect(config, tenantId = "default") {
    try {
      // Prevent connections during shutdown
      if (this.#isShuttingDown) {
        throw new BusinessException("Connection manager is shutting down");
      }

      // Validate configuration
      this.#validateConfig(config, tenantId);

      // Check if already connected
      if (this.#connections.has(tenantId)) {
        const existingConnection = this.#connections.get(tenantId);
        if (existingConnection.readyState === 1) {
          // Connected
          logger.debug(`Database already connected for tenant: ${tenantId}`);
          return existingConnection;
        }
      }

      // Store configuration for reconnection attempts
      this.#connectionConfigs.set(tenantId, config);

      // Create connection with enhanced options
      const connection = await this.#createConnection(config, tenantId);

      // Store connection
      this.#connections.set(tenantId, connection);

      // Initialize connection metrics
      this.#initializeMetrics(tenantId);

      // Setup event listeners
      this.#setupEventListeners(connection, tenantId);

      // Start health monitoring
      this.#startHealthMonitoring(tenantId);

      // Emit connection event
      this.emit("connected", { tenantId, connection });

      logger.info(`✅ MongoDB connected successfully for tenant: ${tenantId}`, {
        host: connection.host,
        port: connection.port,
        name: connection.name,
        readyState: connection.readyState,
      });

      // Audit logging
      await this.#auditLog("DATABASE_CONNECTED", {
        action: "database_connect",
        tenantId,
        host: connection.host,
        port: connection.port,
        status: "success",
      });

      return connection;
    } catch (error) {
      logger.error(`❌ Database connection failed for tenant ${tenantId}:`, {
        error: error.message,
        stack: error.stack,
      });

      // Clean up failed connection attempt
      await this.#cleanupFailedConnection(tenantId);

      // Audit logging
      await this.#auditLog("DATABASE_CONNECTION_FAILED", {
        action: "database_connect",
        tenantId,
        error: error.message,
      });

      throw new BusinessException(
        `Database connection failed: ${error.message}`,
      );
    }
  }

  /**
   * Create MongoDB connection with optimized settings
   * @private
   */
  async #createConnection(config, tenantId) {
    const uri = config.mongo?.uri || config.mongodb?.uri || config.uri;

    if (!uri) {
      throw new BusinessException("MongoDB URI is missing in configuration");
    }

    // Enhanced connection options based on environment
    const connectionOptions = {
      // Connection pool settings
      maxPoolSize: config.mongo?.options?.maxPoolSize || 10,
      minPoolSize: config.mongo?.options?.minPoolSize || 1,

      // Timeout settings
      serverSelectionTimeoutMS:
        config.mongo?.options?.serverSelectionTimeoutMS || 10000,
      socketTimeoutMS: config.mongo?.options?.socketTimeoutMS || 45000,
      connectTimeoutMS: config.mongo?.options?.connectTimeoutMS || 10000,
      maxIdleTimeMS: config.mongo?.options?.maxIdleTimeMS || 300000,

      // Heartbeat and monitoring
      heartbeatFrequencyMS: 10000,
      serverMonitoringMode: "stream",

      // Write and read settings
      retryWrites: true,
      retryReads: true,
      readPreference:
        config.mongo?.options?.readPreference || "primaryPreferred",

      // Other settings
      // bufferCommands: false, // Disable command buffering
      // bufferMaxEntries: 0, // Disable connection buffering

      // SSL/TLS settings (if required)
      // ssl: config.mongo?.options?.ssl || false,
      // sslValidate: config.mongo?.options?.sslValidate || true,

      // Application name for monitoring
      appName: `school-erp-${process.env.NODE_ENV || "development"}-${tenantId}`,

      // Compression
      compressors: ["zlib", "zstd"],
      zlibCompressionLevel: 6,
    };

    logger.debug(`Creating MongoDB connection for tenant: ${tenantId}`, {
      uri: this.#maskUri(uri),
      options: connectionOptions,
    });

    // Create connection with timeout race
    const connectionPromise = mongoose.createConnection(uri, connectionOptions);

    const connection = await Promise.race([
      connectionPromise.asPromise(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("MongoDB connection timed out")),
          15000,
        ),
      ),
    ]);

    // Wait for connection to be fully established
    await this.#waitForConnection(connection, tenantId);

    return connection;
  }

  /**
   * Wait for connection to be fully established
   * @private
   */
  async #waitForConnection(connection, tenantId) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("MongoDB connection establishment timeout"));
      }, 20000);

      if (connection.readyState === 1) {
        // Already connected
        clearTimeout(timeout);
        resolve();
        return;
      }

      const onConnected = () => {
        clearTimeout(timeout);
        connection.removeListener("error", onError);
        logger.debug(`MongoDB connection established for tenant: ${tenantId}`);
        resolve();
      };

      const onError = (error) => {
        clearTimeout(timeout);
        connection.removeListener("connected", onConnected);
        reject(error);
      };

      connection.once("connected", onConnected);
      connection.once("error", onError);
    });
  }

  /**
   * Enhanced disconnect with proper cleanup - UPDATED
   */
  async disconnect(tenantId = "default") {
    try {
      logger.info(`🔌 Disconnecting database for tenant: ${tenantId}`);

      // Stop health monitoring
      this.#stopHealthMonitoring(tenantId);

      // Clear reconnect timer if exists
      this.#clearReconnectTimer(tenantId);

      // Close connection
      if (this.#connections.has(tenantId)) {
        const connection = this.#connections.get(tenantId);

        // ✅ FIXED: Use the updated graceful disconnect
        await this.#gracefulDisconnect(connection);

        this.#connections.delete(tenantId);
      }

      // Clean up stored data
      this.#connectionConfigs.delete(tenantId);
      this.#connectionMetrics.delete(tenantId);

      // Emit disconnection event
      this.emit("disconnected", { tenantId });

      logger.info(
        `✅ Database disconnected successfully for tenant: ${tenantId}`,
      );

      // Audit logging
      await this.#auditLog("DATABASE_DISCONNECTED", {
        action: "database_disconnect",
        tenantId,
        status: "success",
      });
    } catch (error) {
      logger.error(`❌ Database disconnection failed for tenant ${tenantId}:`, {
        error: error.message,
      });

      // Don't throw error during shutdown, just log it
      logger.warn(
        `Continuing with shutdown despite disconnect error for tenant: ${tenantId}`,
      );
    }
  }

  /**
   * Graceful disconnect with operation completion wait - FIXED VERSION
   * @private
   */
  async #gracefulDisconnect(connection) {
    try {
      logger.info("🔄 Starting graceful database disconnect...");

      // Create a timeout promise for forced shutdown
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => {
          logger.warn("⚠️ Graceful disconnect timeout, forcing close");
          resolve("timeout");
        }, 5000);
      });

      // Create close promise without callback
      const closePromise = connection
        .close()
        .then(() => {
          logger.info("✅ Database connection closed gracefully");
          return "closed";
        })
        .catch((error) => {
          logger.warn("⚠️ Error during graceful disconnect:", error.message);
          return "error";
        });

      // Race between graceful close and timeout
      const result = await Promise.race([closePromise, timeoutPromise]);

      if (result === "timeout") {
        // Force close if timeout reached
        try {
          await connection.close(); // Force close without callback
          logger.info("✅ Database connection force closed successfully");
        } catch (forceError) {
          logger.error("💥 Error during force close:", forceError.message);
        }
      }
    } catch (error) {
      logger.error("💥 Graceful disconnect failed:", error.message);
      // Try one more time with force close
      try {
        await connection.close();
      } catch (finalError) {
        logger.error("💥 Final force close failed:", finalError.message);
      }
    }
  }

  /**
   * Get connection with health check
   */
  getConnection(tenantId = "default") {
    const connection = this.#connections.get(tenantId);

    if (!connection) {
      return null;
    }

    // Update last accessed time for metrics
    this.#updateConnectionMetrics(tenantId, "lastAccessed", Date.now());

    return connection;
  }

  /**
   * Get connection with automatic reconnection if needed
   */
  async getConnectionSafe(tenantId = "default") {
    let connection = this.getConnection(tenantId);

    if (!connection || connection.readyState !== 1) {
      const config = this.#connectionConfigs.get(tenantId);
      if (config) {
        logger.info(`Reconnecting to database for tenant: ${tenantId}`);
        connection = await this.connect(config, tenantId);
      }
    }

    return connection;
  }

  /**
   * Check if tenant has active and healthy connection
   */
  isConnected(tenantId = "default") {
    const connection = this.#connections.get(tenantId);
    return connection && connection.readyState === 1;
  }

  /**
   * Get comprehensive connection health status
   */
  getConnectionHealth(tenantId = "default") {
    const connection = this.#connections.get(tenantId);
    const metrics = this.#connectionMetrics.get(tenantId);

    if (!connection || !metrics) {
      return { healthy: false, status: "not_connected" };
    }

    const readyStates = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    return {
      healthy: connection.readyState === 1,
      status: readyStates[connection.readyState],
      host: connection.host,
      port: connection.port,
      name: connection.name,
      metrics: {
        ...metrics,
        uptime: Date.now() - metrics.connectedAt,
        lastHealthCheck: metrics.lastHealthCheck,
      },
    };
  }

  /**
   * Get all connections health status
   */
  getAllConnectionsHealth() {
    const health = {};

    for (const [tenantId] of this.#connections) {
      health[tenantId] = this.getConnectionHealth(tenantId);
    }

    return health;
  }

  /**
   * Disconnect all connections with proper cleanup
   */
  async disconnectAll() {
    this.#isShuttingDown = true;

    logger.info("🛑 Disconnecting all database connections...");

    // Stop all health monitoring
    for (const [tenantId] of this.#healthCheckTimers) {
      this.#stopHealthMonitoring(tenantId);
    }

    // Clear all reconnect timers
    for (const [tenantId] of this.#reconnectTimers) {
      this.#clearReconnectTimer(tenantId);
    }

    // Disconnect all connections concurrently
    const disconnectPromises = Array.from(this.#connections.keys()).map(
      (tenantId) =>
        this.disconnect(tenantId).catch((error) => {
          logger.warn(
            `Failed to disconnect tenant ${tenantId}:`,
            error.message,
          );
        }),
    );

    await Promise.allSettled(disconnectPromises);

    // Clear all maps
    this.#connections.clear();
    this.#connectionConfigs.clear();
    this.#connectionMetrics.clear();

    logger.info("✅ All database connections closed");

    // Emit shutdown complete event
    this.emit("shutdown_complete");
  }

  /**
   * Enhanced event listeners setup
   * @private
   */
  #setupEventListeners(connection, tenantId) {
    // Connection events
    connection.on("connected", () => this.#handleConnected(tenantId));
    connection.on("error", (error) =>
      this.#handleConnectionError(tenantId, error),
    );
    connection.on("disconnected", () => this.#handleDisconnected(tenantId));
    connection.on("reconnected", () => this.#handleReconnected(tenantId));
    connection.on("close", () => this.#handleClose(tenantId));
    connection.on("fullsetup", () => this.#handleFullSetup(tenantId));
    connection.on("all", () => this.#handleAll(tenantId));

    // MongoDB specific events
    connection.on("timeout", () => this.#handleTimeout(tenantId));
    connection.on("parseError", (error) =>
      this.#handleParseError(tenantId, error),
    );
  }

  /**
   * Connection event handlers
   * @private
   */
  #handleConnected = async (tenantId) => {
    logger.info(`🟢 Database connected for tenant: ${tenantId}`);
    this.#updateConnectionMetrics(tenantId, "connectedAt", Date.now());
    this.#updateConnectionMetrics(tenantId, "reconnectAttempts", 0);

    await this.#auditLog("DATABASE_CONNECTED_EVENT", {
      action: "database_event",
      tenantId,
      event: "connected",
    });
  };

  #handleConnectionError = async (tenantId, error) => {
    logger.error(`🔴 Database connection error for tenant ${tenantId}:`, {
      error: error.message,
      code: error.code,
    });

    this.#updateConnectionMetrics(
      tenantId,
      "errors",
      (this.#connectionMetrics.get(tenantId)?.errors || 0) + 1,
    );

    // Emit error event
    this.emit("connection_error", { tenantId, error });

    await this.#auditLog("DATABASE_CONNECTION_ERROR", {
      action: "database_error",
      tenantId,
      error: error.message,
      code: error.code,
    });

    // Attempt reconnection for certain errors
    if (this.#shouldAttemptReconnect(error)) {
      this.#scheduleReconnect(tenantId);
    }
  };

  #handleDisconnected = async (tenantId) => {
    logger.warn(
      `🟡 Database disconnected unexpectedly for tenant: ${tenantId}`,
    );

    this.#updateConnectionMetrics(tenantId, "disconnectedAt", Date.now());

    // Emit disconnection event
    this.emit("unexpected_disconnect", { tenantId });

    await this.#auditLog("DATABASE_DISCONNECTED_EVENT", {
      action: "database_event",
      tenantId,
      event: "disconnected",
      reason: "unexpected",
    });

    // Schedule reconnection
    this.#scheduleReconnect(tenantId);
  };

  #handleReconnected = async (tenantId) => {
    logger.info(`🟢 Database reconnected for tenant: ${tenantId}`);

    this.#updateConnectionMetrics(tenantId, "reconnectedAt", Date.now());
    this.#clearReconnectTimer(tenantId);

    // Emit reconnection event
    this.emit("reconnected", { tenantId });

    await this.#auditLog("DATABASE_RECONNECTED", {
      action: "database_reconnect",
      tenantId,
    });
  };

  #handleClose = (tenantId) => {
    logger.debug(`Database connection closed for tenant: ${tenantId}`);

    this.#updateConnectionMetrics(tenantId, "closedAt", Date.now());

    // Clean up connection from map
    if (this.#connections.has(tenantId)) {
      this.#connections.delete(tenantId);
    }

    // Emit close event
    this.emit("connection_closed", { tenantId });
  };

  #handleFullSetup = (tenantId) => {
    logger.debug(`Database full setup completed for tenant: ${tenantId}`);
    this.#updateConnectionMetrics(tenantId, "fullSetupAt", Date.now());
  };

  #handleAll = (tenantId) => {
    logger.debug(
      `Database replica set fully connected for tenant: ${tenantId}`,
    );
    this.#updateConnectionMetrics(tenantId, "allConnectedAt", Date.now());
  };

  #handleTimeout = (tenantId) => {
    logger.warn(`Database connection timeout for tenant: ${tenantId}`);
    this.#updateConnectionMetrics(
      tenantId,
      "timeouts",
      (this.#connectionMetrics.get(tenantId)?.timeouts || 0) + 1,
    );
  };

  #handleParseError = (tenantId, error) => {
    logger.error(`Database parse error for tenant ${tenantId}:`, error);
    this.#updateConnectionMetrics(
      tenantId,
      "parseErrors",
      (this.#connectionMetrics.get(tenantId)?.parseErrors || 0) + 1,
    );
  };

  /**
   * Health monitoring methods
   * @private
   */
  #startHealthMonitoring(tenantId) {
    if (this.#healthCheckTimers.has(tenantId)) {
      return; // Already monitoring
    }

    const timer = setInterval(() => {
      this.#performHealthCheck(tenantId);
    }, this.#healthCheckInterval);

    this.#healthCheckTimers.set(tenantId, timer);
    logger.debug(`Started health monitoring for tenant: ${tenantId}`);
  }

  #stopHealthMonitoring(tenantId) {
    const timer = this.#healthCheckTimers.get(tenantId);
    if (timer) {
      clearInterval(timer);
      this.#healthCheckTimers.delete(tenantId);
      logger.debug(`Stopped health monitoring for tenant: ${tenantId}`);
    }
  }

  async #performHealthCheck(tenantId) {
    try {
      const connection = this.#connections.get(tenantId);
      if (!connection) {
        return;
      }

      // Simple ping to check connection health
      await connection.db.admin().ping();

      this.#updateConnectionMetrics(tenantId, "lastHealthCheck", Date.now());
      this.#updateConnectionMetrics(
        tenantId,
        "healthChecksPassed",
        (this.#connectionMetrics.get(tenantId)?.healthChecksPassed || 0) + 1,
      );
    } catch (error) {
      logger.warn(`Health check failed for tenant ${tenantId}:`, error.message);

      this.#updateConnectionMetrics(
        tenantId,
        "healthChecksFailed",
        (this.#connectionMetrics.get(tenantId)?.healthChecksFailed || 0) + 1,
      );

      // Schedule reconnection if health check fails
      this.#scheduleReconnect(tenantId);
    }
  }

  /**
   * Reconnection logic with exponential backoff
   * @private
   */
  #scheduleReconnect(tenantId) {
    if (this.#isShuttingDown || this.#reconnectTimers.has(tenantId)) {
      return; // Already scheduled or shutting down
    }

    const metrics = this.#connectionMetrics.get(tenantId);
    const attempts = (metrics?.reconnectAttempts || 0) + 1;

    if (attempts > this.#maxRetryAttempts) {
      logger.error(`Max reconnection attempts reached for tenant: ${tenantId}`);
      this.emit("max_reconnect_attempts_reached", { tenantId, attempts });
      return;
    }

    // Exponential backoff calculation
    const delay = Math.min(
      this.#baseRetryDelay * Math.pow(2, attempts - 1),
      this.#maxRetryDelay,
    );

    logger.info(
      `Scheduling reconnection for tenant ${tenantId} in ${delay}ms (attempt ${attempts})`,
    );

    const timer = setTimeout(() => {
      this.#attemptReconnect(tenantId, attempts);
    }, delay);

    this.#reconnectTimers.set(tenantId, timer);
  }

  async #attemptReconnect(tenantId, attempts) {
    try {
      this.#clearReconnectTimer(tenantId);
      this.#updateConnectionMetrics(tenantId, "reconnectAttempts", attempts);

      logger.info(
        `Attempting reconnection for tenant ${tenantId} (attempt ${attempts})`,
      );

      const config = this.#connectionConfigs.get(tenantId);
      if (!config) {
        throw new Error("Connection configuration not found");
      }

      // Clean up existing connection
      await this.#cleanupFailedConnection(tenantId);

      // Attempt new connection
      await this.connect(config, tenantId);

      logger.info(`✅ Reconnection successful for tenant: ${tenantId}`);
    } catch (error) {
      logger.error(
        `Reconnection failed for tenant ${tenantId}:`,
        error.message,
      );

      // Schedule next attempt
      this.#scheduleReconnect(tenantId);
    }
  }

  #clearReconnectTimer(tenantId) {
    const timer = this.#reconnectTimers.get(tenantId);
    if (timer) {
      clearTimeout(timer);
      this.#reconnectTimers.delete(tenantId);
    }
  }

  #shouldAttemptReconnect(error) {
    const reconnectableErrors = [
      "ECONNRESET",
      "ENOTFOUND",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "MongoNetworkError",
      "MongoServerSelectionError",
    ];

    return reconnectableErrors.some(
      (errCode) =>
        error.code === errCode ||
        error.name === errCode ||
        error.message.includes(errCode),
    );
  }

  /**
   * Utility methods
   * @private
   */
  #validateConfig(config, tenantId) {
    if (!config) {
      throw new BusinessException("Database configuration is required");
    }

    if (!tenantId || typeof tenantId !== "string") {
      throw new BusinessException("Valid tenant ID is required");
    }

    const uri = config.mongo?.uri || config.mongodb?.uri || config.uri;
    if (!uri) {
      throw new BusinessException("MongoDB URI is missing in configuration");
    }

    // Validate URI format
    if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
      throw new BusinessException("Invalid MongoDB URI format");
    }
  }

  #maskUri(uri) {
    return uri.replace(/:\/\/.*@/, "://***:***@");
  }

  #initializeMetrics(tenantId) {
    this.#connectionMetrics.set(tenantId, {
      connectedAt: Date.now(),
      lastAccessed: Date.now(),
      reconnectAttempts: 0,
      errors: 0,
      timeouts: 0,
      parseErrors: 0,
      healthChecksPassed: 0,
      healthChecksFailed: 0,
    });
  }

  #updateConnectionMetrics(tenantId, key, value) {
    const metrics = this.#connectionMetrics.get(tenantId);
    if (metrics) {
      metrics[key] = value;
    }
  }

  async #cleanupFailedConnection(tenantId) {
    if (this.#connections.has(tenantId)) {
      try {
        const failedConnection = this.#connections.get(tenantId);
        await failedConnection.close();
      } catch (closeError) {
        logger.warn(`Failed to close failed connection: ${closeError.message}`);
      }
      this.#connections.delete(tenantId);
    }
  }

  async #auditLog(event, data) {
    try {
      await AuditService.log(event, data);
    } catch (auditError) {
      logger.warn(`Audit logging failed: ${auditError.message}`);
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats() {
    const stats = {
      totalConnections: this.#connections.size,
      connections: {},
      summary: {
        healthy: 0,
        unhealthy: 0,
        connecting: 0,
        disconnected: 0,
      },
    };

    for (const [tenantId, connection] of this.#connections) {
      const metrics = this.#connectionMetrics.get(tenantId);
      const health = this.getConnectionHealth(tenantId);

      stats.connections[tenantId] = {
        readyState: connection.readyState,
        host: connection.host,
        port: connection.port,
        name: connection.name,
        healthy: health.healthy,
        metrics,
      };

      // Update summary
      if (health.healthy) {
        stats.summary.healthy++;
      } else {
        switch (connection.readyState) {
          case 0:
            stats.summary.disconnected++;
            break;
          case 2:
            stats.summary.connecting++;
            break;
          default:
            stats.summary.unhealthy++;
        }
      }
    }

    return stats;
  }

  /**
   * Force reconnect for a tenant
   */
  async forceReconnect(tenantId = "default") {
    logger.info(`🔄 Force reconnecting tenant: ${tenantId}`);

    const config = this.#connectionConfigs.get(tenantId);
    if (!config) {
      throw new BusinessException(
        "Connection configuration not found for tenant",
      );
    }

    // Disconnect existing connection
    if (this.#connections.has(tenantId)) {
      await this.disconnect(tenantId);
    }

    // Create new connection
    return await this.connect(config, tenantId);
  }

  /**
   * Get connection uptime
   */
  getConnectionUptime(tenantId = "default") {
    const metrics = this.#connectionMetrics.get(tenantId);
    if (!metrics || !metrics.connectedAt) {
      return 0;
    }

    return Date.now() - metrics.connectedAt;
  }

  /**
   * Export connection metrics for monitoring
   */
  exportMetrics() {
    const allMetrics = {};

    for (const [tenantId, metrics] of this.#connectionMetrics) {
      const connection = this.#connections.get(tenantId);

      allMetrics[tenantId] = {
        ...metrics,
        readyState: connection?.readyState || 0,
        uptime: this.getConnectionUptime(tenantId),
        healthy: this.isConnected(tenantId),
      };
    }

    return allMetrics;
  }
}

// Export singleton instance and utility functions
export const dbManager = DatabaseConnectionManager.getInstance();
export const connectDatabase = (config, tenantId) =>
  dbManager.connect(config, tenantId);
export const disconnectDatabase = (tenantId) => dbManager.disconnect(tenantId);
export const getConnection = (tenantId) => dbManager.getConnection(tenantId);
export const getConnectionSafe = (tenantId) =>
  dbManager.getConnectionSafe(tenantId);
export const isConnected = (tenantId) => dbManager.isConnected(tenantId);
export const getConnectionHealth = (tenantId) =>
  dbManager.getConnectionHealth(tenantId);
export const forceReconnect = (tenantId) => dbManager.forceReconnect(tenantId);
export const getConnectionStats = () => dbManager.getConnectionStats();

export default DatabaseConnectionManager;
