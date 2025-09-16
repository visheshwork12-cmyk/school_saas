// src/infrastructure/database/mongodb/migrations/aws/aws-migration-runner.js
import mongoose from "mongoose";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { AtlasConnectionManager } from "./atlas-connection.js";
import { AWSConfigValidator } from "./aws-config-validator.js";
import baseConfig from "#shared/config/environments/base.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AWS-specific Migration Runner
 * Handles MongoDB Atlas migrations with AWS-specific optimizations
 */
export class AWSMigrationRunner {
  constructor() {
    this.migrationsDir = path.join(__dirname, "..", "versions");
    this.migrationCollection = "aws_migrations";
    this.lockCollection = "aws_migration_locks";
    this.atlasConnection = new AtlasConnectionManager();
    this.configValidator = new AWSConfigValidator();
    this.awsRegion = process.env.AWS_REGION || "us-east-1";
    this.isAtlas = process.env.MONGODB_URI?.includes("mongodb+srv://");
  }

  /**
   * Initialize AWS-optimized migration environment
   */
  async initialize() {
    try {
      logger.info("🔄 Initializing AWS Migration Runner...");

      // Validate AWS configuration
      await this.configValidator.validateAWSConfig();

      // Initialize Atlas connection with AWS optimizations
      if (this.isAtlas) {
        await this.atlasConnection.initialize();
        logger.info("✅ MongoDB Atlas connection initialized");
      }

      // Set AWS-specific connection optimizations
      await this.configureAWSOptimizations();

      logger.info("✅ AWS Migration Runner initialized successfully");
    } catch (error) {
      logger.error("❌ Failed to initialize AWS Migration Runner:", error);
      throw error;
    }
  }

  /**
   * Configure AWS-specific optimizations
   */
  async configureAWSOptimizations() {
    // Set connection pool settings optimized for AWS Lambda
    if (process.env.AWS_LAMBDA_FUNCTION_NAME) {
      mongoose.connection.config.maxPoolSize = 1;
      mongoose.connection.config.serverSelectionTimeoutMS = 5000;
      mongoose.connection.config.connectTimeoutMS = 10000;
    }

    // Configure retry logic for AWS network conditions
    mongoose.connection.config.retryReads = true;
    mongoose.connection.config.retryWrites = true;
    mongoose.connection.config.readPreference = "primaryPreferred";

    logger.info("✅ AWS optimizations configured");
  }

  /**
   * Run AWS-specific migrations
   */
  async runMigrations(direction = "up", target = null, options = {}) {
    const migrationId = `aws-migration-${Date.now()}-${process.pid}`;
    let connection = null;

    try {
      logger.info(`🚀 Starting AWS migrations (${direction})...`);

      // Connect with AWS optimizations
      connection = await this.atlasConnection.connect();

      // Acquire migration lock with AWS-specific settings
      await this.acquireAWSMigrationLock(connection, migrationId);

      // Load AWS-specific migrations
      const migrations = await this.loadAWSMigrations();

      // Get completed migrations
      const completedMigrations = await this.getCompletedMigrations(connection);

      // Determine migrations to run
      const migrationsToRun = this.determineMigrationsToRun(
        migrations,
        completedMigrations,
        direction,
        target
      );

      if (migrationsToRun.length === 0) {
        logger.info("✅ No AWS migrations to run");
        return { success: true, migrationsRun: 0 };
      }

      logger.info(`📊 Found ${migrationsToRun.length} AWS migrations to run`);

      // Run migrations with AWS monitoring
      const results = [];
      for (const migration of migrationsToRun) {
        const result = await this.runSingleAWSMigration(
          connection,
          migration,
          direction,
          options
        );
        results.push(result);
      }

      // Log to CloudWatch if available
      await this.logToCloudWatch({
        action: "migrations_completed",
        direction,
        migrationsCount: migrationsToRun.length,
        region: this.awsRegion,
        results,
      });

      logger.info("🎉 All AWS migrations completed successfully");
      return { success: true, migrationsRun: migrationsToRun.length, results };
    } catch (error) {
      logger.error(`❌ AWS migration failed: ${error.message}`, {
        stack: error.stack,
      });

      // Log error to CloudWatch
      await this.logToCloudWatch({
        action: "migration_error",
        error: error.message,
        stack: error.stack,
        migrationId,
      });

      throw error;
    } finally {
      if (connection) {
        await this.releaseAWSMigrationLock(connection, migrationId);
        await this.atlasConnection.disconnect();
      }
    }
  }

  /**
   * Load AWS-specific migrations
   */
  async loadAWSMigrations() {
    const files = await fs.readdir(this.migrationsDir);
    const migrationFiles = files
      .filter((file) => file.match(/^\d{3}_.*\.js$/) && file.includes("aws"))
      .sort();

    const migrations = [];

    for (const file of migrationFiles) {
      const filePath = path.join(this.migrationsDir, file);
      const migration = await import(filePath);

      migrations.push({
        id: file.replace(".js", ""),
        name: file,
        up: migration.up,
        down: migration.down,
        description: migration.description || "AWS migration",
        awsOptimized: true,
        region: this.awsRegion,
      });
    }

    return migrations;
  }

  /**
   * Run single AWS migration with monitoring
   */
  async runSingleAWSMigration(connection, migration, direction, options) {
    const startTime = Date.now();
    const migrationContext = {
      region: this.awsRegion,
      isLambda: !!process.env.AWS_LAMBDA_FUNCTION_NAME,
      timestamp: new Date().toISOString(),
    };

    try {
      logger.info(
        `${direction === "up" ? "⬆️" : "⬇️"} Running AWS migration: ${migration.name}`
      );

      // Start Atlas session with AWS optimizations
      const session = await connection.startSession({
        readPreference: "primaryPreferred",
        readConcern: { level: "majority" },
      });

      await session.withTransaction(
        async () => {
          if (direction === "up") {
            await migration.up(connection, session, migrationContext);
          } else {
            await migration.down(connection, session, migrationContext);
          }
        },
        {
          readPreference: "primary",
          writeConcern: { w: "majority", j: true },
          maxCommitTimeMS: 30000,
        }
      );

      const executionTime = Date.now() - startTime;

      // Record migration in AWS-specific collection
      await this.recordAWSMigration(
        connection,
        migration,
        direction,
        executionTime,
        migrationContext
      );

      // Audit log for compliance
      await AuditService.log("AWS_MIGRATION_EXECUTED", {
        migrationId: migration.id,
        direction,
        executionTime,
        region: this.awsRegion,
        success: true,
      });

      logger.info(
        `✅ AWS migration completed: ${migration.name} (${executionTime}ms)`
      );

      return {
        migration: migration.name,
        success: true,
        executionTime,
        direction,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(
        `❌ AWS migration failed: ${migration.name} (${executionTime}ms)`,
        { error: error.message, stack: error.stack }
      );

      // Audit log for compliance
      await AuditService.log("AWS_MIGRATION_FAILED", {
        migrationId: migration.id,
        direction,
        executionTime,
        error: error.message,
        region: this.awsRegion,
      });

      throw error;
    }
  }

  /**
   * Record AWS migration with additional metadata
   */
  async recordAWSMigration(
    connection,
    migration,
    direction,
    executionTime,
    context
  ) {
    const AWSMigration = connection.model(
      "AWSMigration",
      new mongoose.Schema({
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        description: { type: String },
        direction: { type: String, enum: ["up", "down"] },
        executedAt: { type: Date, default: Date.now },
        executionTime: { type: Number },
        awsRegion: { type: String },
        awsContext: { type: mongoose.Schema.Types.Mixed },
        checksum: { type: String },
        version: { type: String, default: "1.0.0" },
      }),
      this.migrationCollection
    );

    if (direction === "up") {
      await AWSMigration.create({
        id: migration.id,
        name: migration.name,
        description: migration.description,
        direction,
        executionTime,
        awsRegion: context.region,
        awsContext: context,
        checksum: this.generateChecksum(migration),
        version: baseConfig.versioning?.currentApiVersion || "1.0.0",
      });
    } else {
      await AWSMigration.deleteOne({ id: migration.id });
    }
  }

  /**
   * Acquire AWS-optimized migration lock
   */
  async acquireAWSMigrationLock(connection, migrationId) {
    const AWSLock = connection.model(
      "AWSMigrationLock",
      new mongoose.Schema({
        _id: { type: String, default: "aws_migration_lock" },
        isLocked: { type: Boolean, default: false },
        lockedBy: { type: String },
        lockedAt: { type: Date },
        awsRegion: { type: String },
        lockTTL: { type: Date },
      }),
      this.lockCollection
    );

    const maxAttempts = 30; // Reduced for AWS Lambda timeout constraints
    const lockTTL = new Date(Date.now() + 300000); // 5 minutes TTL
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await AWSLock.findOneAndUpdate(
          {
            _id: "aws_migration_lock",
            $or: [{ isLocked: false }, { lockTTL: { $lt: new Date() } }],
          },
          {
            isLocked: true,
            lockedBy: migrationId,
            lockedAt: new Date(),
            awsRegion: this.awsRegion,
            lockTTL,
          },
          { upsert: true }
        );

        logger.debug(`🔒 AWS migration lock acquired: ${migrationId}`);
        return;
      } catch (error) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    throw new Error(
      "Could not acquire AWS migration lock - another migration might be running"
    );
  }

  /**
   * Release AWS migration lock
   */
  async releaseAWSMigrationLock(connection, migrationId) {
    try {
      const AWSLock = connection.model(
        "AWSMigrationLock",
        new mongoose.Schema({
          _id: { type: String, default: "aws_migration_lock" },
          isLocked: { type: Boolean, default: false },
          lockedBy: { type: String },
          lockedAt: { type: Date },
          awsRegion: { type: String },
          lockTTL: { type: Date },
        }),
        this.lockCollection
      );

      await AWSLock.findOneAndUpdate(
        { _id: "aws_migration_lock", lockedBy: migrationId },
        {
          isLocked: false,
          lockedBy: null,
          lockedAt: null,
          lockTTL: null,
        }
      );

      logger.debug(`🔓 AWS migration lock released: ${migrationId}`);
    } catch (error) {
      logger.warn(`Failed to release AWS migration lock: ${error.message}`);
    }
  }

  /**
   * Log to CloudWatch if available
   */
  async logToCloudWatch(logData) {
    if (!baseConfig.aws?.cloudWatch?.enabled) {
      return;
    }

    try {
      // Implementation would use AWS SDK to send logs to CloudWatch
      // This is a placeholder for the actual CloudWatch implementation
      logger.debug("📊 Logging to CloudWatch:", logData);
    } catch (error) {
      logger.warn("Failed to log to CloudWatch:", error.message);
    }
  }

  /**
   * Generate checksum for migration validation
   */
  async generateChecksum(migration) {
    const crypto = await import("crypto");
    const content = migration.up.toString() + migration.down.toString();
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Get completed migrations
   */
  async getCompletedMigrations(connection) {
    const AWSMigration = connection.model(
      "AWSMigration",
      new mongoose.Schema({
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        executedAt: { type: Date, default: Date.now },
      }),
      this.migrationCollection
    );

    const completed = await AWSMigration.find({})
      .sort({ executedAt: 1 })
      .lean();
    return completed.map((m) => m.id);
  }

  /**
   * Determine which migrations to run
   */
  determineMigrationsToRun(migrations, completed, direction, target) {
    if (direction === "up") {
      const pending = migrations.filter((m) => !completed.includes(m.id));
      if (target) {
        const targetIndex = pending.findIndex((m) => m.id === target);
        return targetIndex >= 0 ? pending.slice(0, targetIndex + 1) : [];
      }
      return pending;
    } else {
      const completedMigrations = migrations.filter((m) =>
        completed.includes(m.id)
      );
      completedMigrations.reverse();
      if (target) {
        const targetIndex = completedMigrations.findIndex(
          (m) => m.id === target
        );
        return targetIndex >= 0
          ? completedMigrations.slice(0, targetIndex + 1)
          : [];
      }
      return completedMigrations.slice(-1); // Only rollback last migration
    }
  }
}

export default AWSMigrationRunner;
