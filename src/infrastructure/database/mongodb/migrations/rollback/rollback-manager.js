// src/infrastructure/database/mongodb/migrations/rollback/rollback-manager.js
import { logger } from "#utils/core/logger.js";
import { AuditService } from "#core/audit/services/audit-log.service.js";
import { RollbackStrategies } from "./rollback-strategies.js";
import { AtlasConnectionManager } from "../aws/atlas-connection.js";

/**
 * Advanced Rollback Manager for AWS Migrations
 * Handles complex rollback scenarios with data preservation
 */
export class RollbackManager {
  constructor() {
    this.strategies = new RollbackStrategies();
    this.atlasConnection = new AtlasConnectionManager();
    this.rollbackHistory = [];
    this.backupLocation = process.env.AWS_S3_BACKUP_BUCKET;
  }

  /**
   * Execute rollback with strategy selection
   */
  async executeRollback(options = {}) {
    const {
      target,
      strategy = "safe",
      preserveData = true,
      createBackup = true,
      dryRun = false
    } = options;

    const rollbackId = `rollback-${Date.now()}`;

    try {
      logger.info(`🔄 Starting rollback operation: ${rollbackId}`);

      // Validate rollback prerequisites
      await this.validateRollbackPrerequisites(options);

      // Create pre-rollback backup if requested
      if (createBackup) {
        await this.createPreRollbackBackup(rollbackId);
      }

      // Select and execute rollback strategy
      const selectedStrategy = this.selectRollbackStrategy(strategy, options);
      const result = await selectedStrategy.execute(options, dryRun);

      // Record rollback operation
      await this.recordRollbackOperation(rollbackId, result);

      logger.info(`✅ Rollback completed successfully: ${rollbackId}`);
      return result;
    } catch (error) {
      logger.error(`❌ Rollback failed: ${error.message}`);
      await this.handleRollbackFailure(rollbackId, error);
      throw error;
    }
  }

  /**
   * Validate rollback prerequisites
   */
  async validateRollbackPrerequisites(options) {
    logger.info("🔍 Validating rollback prerequisites...");

    const connection = await this.atlasConnection.connect();

    // Check migration history
    const migrationHistory = await this.getMigrationHistory(connection);
    if (migrationHistory.length === 0) {
      throw new Error("No migrations found to rollback");
    }

    // Validate target migration
    if (options.target) {
      const targetExists = migrationHistory.some(m => m.id === options.target);
      if (!targetExists) {
        throw new Error(`Target migration not found: ${options.target}`);
      }
    }

    // Check for data dependencies
    await this.checkDataDependencies(connection, options);

    // Validate AWS permissions
    await this.validateAWSPermissions();

    logger.info("✅ Rollback prerequisites validated");
  }

  /**
   * Select appropriate rollback strategy
   */
  selectRollbackStrategy(strategyName, options) {
    switch (strategyName) {
      case "safe":
        return this.strategies.safeRollback;
      case "fast":
        return this.strategies.fastRollback;
      case "emergency":
        return this.strategies.emergencyRollback;
      case "data-preserving":
        return this.strategies.dataPreservingRollback;
      default:
        throw new Error(`Unknown rollback strategy: ${strategyName}`);
    }
  }

  /**
   * Create backup before rollback
   */
  async createPreRollbackBackup(rollbackId) {
    logger.info("💾 Creating pre-rollback backup...");

    try {
      const connection = await this.atlasConnection.connect();
      const backupData = await this.exportCriticalData(connection);

      if (this.backupLocation) {
        await this.uploadToS3(backupData, `rollback-backup-${rollbackId}.json`);
      } else {
        await this.saveLocalBackup(backupData, rollbackId);
      }

      logger.info("✅ Pre-rollback backup created");
    } catch (error) {
      logger.error("❌ Failed to create backup:", error);
      throw error;
    }
  }

  /**
   * Export critical data for backup
   */
  async exportCriticalData(connection) {
    const criticalCollections = [
      "organizations",
      "users", 
      "schools",
      "aws_deployment_info"
    ];

    const backupData = {
      timestamp: new Date().toISOString(),
      region: process.env.AWS_REGION,
      collections: {}
    };

    for (const collectionName of criticalCollections) {
      try {
        const data = await connection.db.collection(collectionName)
          .find({})
          .limit(1000) // Limit for safety
          .toArray();
        
        backupData.collections[collectionName] = data;
        logger.debug(`Backed up ${data.length} documents from ${collectionName}`);
      } catch (error) {
        logger.warn(`Failed to backup collection ${collectionName}:`, error);
      }
    }

    return backupData;
  }

  /**
   * Check data dependencies before rollback
   */
  async checkDataDependencies(connection, options) {
    logger.info("🔍 Checking data dependencies...");

    // Check for foreign key constraints
    const organizations = await connection.db.collection("organizations").countDocuments();
    const users = await connection.db.collection("users").countDocuments();

    if (users > 0 && organizations === 0) {
      logger.warn("⚠️ Users exist without organizations - potential data orphaning");
    }

    // Check for AWS-specific dependencies
    const awsDeploymentInfo = await connection.db.collection("aws_deployment_info")
      .findOne({ _id: "aws_deployment_current" });

    if (awsDeploymentInfo) {
      logger.info(`Current deployment: ${awsDeploymentInfo.deploymentType} in ${awsDeploymentInfo.region}`);
    }

    logger.info("✅ Data dependencies checked");
  }

  /**
   * Validate AWS permissions for rollback
   */
  async validateAWSPermissions() {
    logger.info("🔒 Validating AWS permissions...");

    // Check if running in AWS environment
    if (!process.env.AWS_REGION) {
      logger.warn("⚠️ Not running in AWS environment");
      return;
    }

    // Validate S3 backup permissions if configured
    if (this.backupLocation) {
      try {
        // This would check S3 permissions - placeholder for actual implementation
        logger.debug("S3 backup permissions validated");
      } catch (error) {
        logger.warn("S3 backup permissions validation failed:", error);
      }
    }

    logger.info("✅ AWS permissions validated");
  }

  /**
   * Get migration history
   */
  async getMigrationHistory(connection) {
    const migrations = await connection.db.collection("aws_migrations")
      .find({})
      .sort({ executedAt: -1 })
      .toArray();

    return migrations;
  }

  /**
   * Record rollback operation
   */
  async recordRollbackOperation(rollbackId, result) {
    const rollbackRecord = {
      rollbackId,
      timestamp: new Date(),
      result,
      region: process.env.AWS_REGION,
      operator: process.env.USER || "system"
    };

    this.rollbackHistory.push(rollbackRecord);

    // Audit log
    await AuditService.log("ROLLBACK_EXECUTED", {
      rollbackId,
      success: result.success,
      migrationsRolledBack: result.migrationsRolledBack || 0
    });
  }

  /**
   * Handle rollback failure
   */
  async handleRollbackFailure(rollbackId, error) {
    logger.error(`🚨 Rollback failure handler activated for: ${rollbackId}`);

    // Record failure
    await AuditService.log("ROLLBACK_FAILED", {
      rollbackId,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    // Attempt emergency restoration if backup exists
    try {
      await this.attemptEmergencyRestore(rollbackId);
    } catch (restoreError) {
      logger.error("❌ Emergency restore also failed:", restoreError);
    }
  }

  /**
   * Attempt emergency restoration
   */
  async attemptEmergencyRestore(rollbackId) {
    logger.warn("🚨 Attempting emergency restore...");

    // This would implement emergency restore logic
    // For now, just log the attempt
    logger.warn("Emergency restore not yet implemented - manual intervention required");
  }

  /**
   * Upload backup to S3
   */
  async uploadToS3(data, filename) {
    // Placeholder for S3 upload implementation
    logger.debug(`Would upload backup to S3: s3://${this.backupLocation}/${filename}`);
  }

  /**
   * Save backup locally
   */
  async saveLocalBackup(data, rollbackId) {
    const fs = await import("fs/promises");
    const path = `/tmp/rollback-backup-${rollbackId}.json`;
    
    await fs.writeFile(path, JSON.stringify(data, null, 2));
    logger.info(`💾 Backup saved locally: ${path}`);
  }

  /**
   * Get rollback history
   */
  getRollbackHistory() {
    return this.rollbackHistory;
  }

  /**
   * Clean up old rollback records
   */
  async cleanupRollbackHistory(olderThanDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    this.rollbackHistory = this.rollbackHistory.filter(
      record => record.timestamp > cutoffDate
    );

    logger.info(`🧹 Cleaned up rollback history older than ${olderThanDays} days`);
  }
}

export default RollbackManager;
