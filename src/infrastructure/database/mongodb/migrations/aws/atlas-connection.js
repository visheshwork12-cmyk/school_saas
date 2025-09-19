// src/infrastructure/database/mongodb/migrations/aws/atlas-connection.js
import mongoose from "mongoose";
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import baseConfig from "#shared/config/environments/base.config.js";
import { mongooseSanitizeMiddleware } from "#infrastructure/security/nosql-injection-protection.js";


/**
 * MongoDB Atlas Connection Manager for AWS Environment
 * Optimized for AWS Lambda, ECS, and EC2 deployments
 */
export class AtlasConnectionManager {
  constructor() {
    this.connection = null;
    this.connectionState = "disconnected";
    this.retryCount = 0;
    this.maxRetries = 3;
    this.awsRegion = process.env.AWS_REGION || "us-east-1";
    this.isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
  }

  /**
   * Initialize Atlas connection with AWS optimizations
   */
  async initialize() {
    try {
      logger.info("🔄 Initializing MongoDB Atlas connection for AWS...");
      
      await this.validateConnectionString();
      await this.configureConnectionOptions();
      
      logger.info("✅ Atlas connection manager initialized");
    } catch (error) {
      logger.error("❌ Failed to initialize Atlas connection:", error);
      throw error;
    }
  }

  /**
   * Validate MongoDB connection string for Atlas
   */
  async validateConnectionString() {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error("MONGODB_URI environment variable is required");
    }

    if (!uri.includes("mongodb+srv://")) {
      logger.warn("⚠️ URI doesn't appear to be MongoDB Atlas format");
    }

    if (!uri.includes("retryWrites=true")) {
      logger.warn("⚠️ Consider adding retryWrites=true to connection string");
    }
  }

  /**
   * Configure connection options for AWS deployment
   */
  async configureConnectionOptions() {
    this.connectionOptions = {
      // AWS Lambda optimizations
      maxPoolSize: this.isLambda ? 1 : 10,
      minPoolSize: this.isLambda ? 0 : 1,
      
      // Timeout configurations for AWS network
      serverSelectionTimeoutMS: this.isLambda ? 5000 : 10000,
      socketTimeoutMS: this.isLambda ? 30000 : 45000,
      connectTimeoutMS: this.isLambda ? 10000 : 30000,
      maxIdleTimeMS: this.isLambda ? 30000 : 300000,
      
      // Reliability settings for AWS
      retryWrites: true,
      retryReads: true,
      readPreference: "primaryPreferred",
      readConcern: { level: "majority" },
      writeConcern: { w: "majority", j: true },
      
      // Atlas-specific optimizations
      useNewUrlParser: true,
      useUnifiedTopology: true,
      
      // AWS network optimizations
      heartbeatFrequencyMS: this.isLambda ? 60000 : 10000,
      family: 4, // Use IPv4
      
      // Buffer settings for Lambda
      bufferCommands: !this.isLambda,
      bufferMaxEntries: this.isLambda ? 0 : -1,
    };

    logger.debug("📋 Connection options configured for AWS environment");
  }

  /**
   * Establish connection to MongoDB Atlas
   */
  async connect() {
    if (this.connection && this.connectionState === "connected") {
      logger.debug("♻️ Reusing existing Atlas connection");
      return this.connection;
    }

    try {
      logger.info("🔗 Connecting to MongoDB Atlas...");
      
      const uri = this.buildConnectionURI();
      
      this.connection = await mongoose.createConnection(uri, this.connectionOptions);
      
      // Set up connection event handlers
      this.setupConnectionHandlers();
      
      // Wait for connection to be ready
      await this.waitForConnection();
      
      this.connectionState = "connected";
      this.retryCount = 0;
      
      // Log connection success
      await this.logConnectionEvent("ATLAS_CONNECTED", {
        region: this.awsRegion,
        deployment: this.isLambda ? "lambda" : "container",
        poolSize: this.connectionOptions.maxPoolSize,
      });
      
      logger.info("✅ Successfully connected to MongoDB Atlas");
      return this.connection;
    } catch (error) {
      logger.error("❌ Failed to connect to MongoDB Atlas:", error);
      await this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Build optimized connection URI for Atlas
   */
  buildConnectionURI() {
    let uri = process.env.MONGODB_URI;
    
    // Add AWS-specific connection parameters if not present
    const params = new URLSearchParams();
    
    if (!uri.includes("retryWrites")) {
      params.append("retryWrites", "true");
    }
    
    if (!uri.includes("w=")) {
      params.append("w", "majority");
    }
    
    if (this.isLambda && !uri.includes("maxPoolSize")) {
      params.append("maxPoolSize", "1");
    }
    
    // Add SSL for Atlas (should be default)
    if (!uri.includes("ssl=")) {
      params.append("ssl", "true");
    }
    
    if (params.toString()) {
      const separator = uri.includes("?") ? "&" : "?";
      uri += separator + params.toString();
    }
    
    return uri;
  }

  /**
   * Set up connection event handlers
   */
  setupConnectionHandlers() {
    this.connection.on("connected", () => {
      logger.debug("📡 Atlas connection established");
      this.connectionState = "connected";
    });

    this.connection.on("error", (error) => {
      logger.error("❌ Atlas connection error:", error);
      this.connectionState = "error";
      this.handleConnectionError(error);
    });

    this.connection.on("disconnected", () => {
      logger.warn("📡 Atlas connection lost");
      this.connectionState = "disconnected";
    });

    this.connection.on("reconnected", () => {
      logger.info("📡 Atlas connection restored");
      this.connectionState = "connected";
      this.retryCount = 0;
    });

    // Lambda-specific handlers
    if (this.isLambda) {
      this.connection.on("close", () => {
        logger.debug("📡 Atlas connection closed (Lambda)");
        this.connectionState = "closed";
      });
    }
  }

  /**
   * Wait for connection to be ready
   */
  async waitForConnection() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, this.connectionOptions.connectTimeoutMS);

      if (this.connection.readyState === 1) {
        clearTimeout(timeout);
        resolve();
      } else {
        this.connection.once("connected", () => {
          clearTimeout(timeout);
          resolve();
        });
        
        this.connection.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      }
    });
  }

  /**
   * Handle connection errors with retry logic
   */
  async handleConnectionError(error) {
    this.retryCount++;
    
    await this.logConnectionEvent("ATLAS_CONNECTION_ERROR", {
      error: error.message,
      retryCount: this.retryCount,
      region: this.awsRegion,
    });

    if (this.retryCount < this.maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, this.retryCount), 10000);
      logger.info(`🔄 Retrying Atlas connection in ${delay}ms...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      try {
        await this.connect();
      } catch (retryError) {
        logger.error("❌ Retry failed:", retryError);
      }
    } else {
      logger.error("❌ Max connection retries exceeded");
      throw error;
    }
  }

  /**
   * Disconnect from Atlas
   */
  async disconnect() {
    if (!this.connection || this.connectionState === "disconnected") {
      return;
    }

    try {
      logger.info("🔌 Disconnecting from MongoDB Atlas...");
      
      await this.connection.close();
      
      this.connection = null;
      this.connectionState = "disconnected";
      
      await this.logConnectionEvent("ATLAS_DISCONNECTED", {
        region: this.awsRegion,
      });
      
      logger.info("✅ Disconnected from MongoDB Atlas");
    } catch (error) {
      logger.error("❌ Error during Atlas disconnection:", error);
      throw error;
    }
  }

  /**
   * Get connection health status
   */
  getConnectionHealth() {
    return {
      state: this.connectionState,
      readyState: this.connection?.readyState || 0,
      retryCount: this.retryCount,
      isLambda: this.isLambda,
      region: this.awsRegion,
      poolSize: this.connectionOptions?.maxPoolSize || 0,
    };
  }

  /**
   * Test Atlas connection
   */
  async testConnection() {
    try {
      if (!this.connection || this.connection.readyState !== 1) {
        await this.connect();
      }
      
      // Perform a simple ping
      await this.connection.db.admin().ping();
      
      logger.info("✅ Atlas connection test successful");
      return true;
    } catch (error) {
      logger.error("❌ Atlas connection test failed:", error);
      return false;
    }
  }

  /**
   * Log connection events for monitoring
   */
  async logConnectionEvent(eventType, data) {
    try {
      await AuditService.log(eventType, {
        ...data,
        timestamp: new Date().toISOString(),
        component: "AtlasConnectionManager",
      });
    } catch (error) {
      // Don't fail migration due to audit logging issues
      logger.debug("Failed to log connection event:", error.message);
    }
  }

  /**
   * Force reconnection (useful for Lambda reuse)
   */
  async forceReconnect() {
    logger.info("🔄 Forcing Atlas reconnection...");
    
    if (this.connection) {
      await this.disconnect();
    }
    
    this.retryCount = 0;
    return await this.connect();
  }
}

export default AtlasConnectionManager;
