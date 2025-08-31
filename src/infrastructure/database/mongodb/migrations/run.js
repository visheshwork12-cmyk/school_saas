import mongoose from "mongoose";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import {
  connectDatabase,
  disconnectDatabase,
} from "#shared/database/connection-manager.js";
import baseConfig from "#shared/config/environments/base.config.js";
import { logger } from "#utils/core/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Migration Manager
 * Handles schema migrations with rollback capabilities
 */
class MigrationManager {
  constructor() {
    this.migrationsDir = __dirname;
    this.migrationCollection = "migrations";
    this.lockCollection = "migration_locks";
  }

  async run(direction = "up", target = null) {
    const migrationId = `migration-${Date.now()}-${process.pid}`;
    let connection = null;

    try {
      logger.info(`🔄 Starting database migrations (${direction})...`);

      // Connect to database
      connection = await connectDatabase(baseConfig, "migration");

      // Acquire migration lock
      await this.acquireLock(connection, migrationId);

      // Get available migrations
      const migrations = await this.loadMigrations();

      // Get completed migrations
      const completedMigrations = await this.getCompletedMigrations(connection);

      // Determine migrations to run
      const migrationsToRun = this.determineMigrationsToRun(
        migrations,
        completedMigrations,
        direction,
        target,
      );

      if (migrationsToRun.length === 0) {
        logger.info("✅ No migrations to run");
        return;
      }

      logger.info(`Found ${migrationsToRun.length} migrations to run`);

      // Run migrations
      for (const migration of migrationsToRun) {
        await this.runSingleMigration(connection, migration, direction);
      }

      logger.info("✅ All migrations completed successfully");
    } catch (error) {
      logger.error(`❌ Migration failed: ${error.message}`, {
        stack: error.stack,
      });
      throw error;
    } finally {
      // Release lock and disconnect
      if (connection) {
        await this.releaseLock(connection, migrationId);
        await disconnectDatabase("migration");
      }
    }
  }

  async loadMigrations() {
    const files = await fs.readdir(this.migrationsDir);
    const migrationFiles = files
      .filter((file) => file.match(/^\d{3}_.*\.js$/) && file !== "run.js")
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
        description: migration.description || "No description",
      });
    }

    return migrations;
  }

  async getCompletedMigrations(connection) {
    const Migration = connection.model(
      "Migration",
      new mongoose.Schema({
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        executedAt: { type: Date, default: Date.now },
        executionTime: { type: Number },
        checksum: { type: String },
      }),
      this.migrationCollection,
    );

    const completed = await Migration.find({}).sort({ executedAt: 1 }).lean();
    return completed.map((m) => m.id);
  }

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
        completed.includes(m.id),
      );
      completedMigrations.reverse();

      if (target) {
        const targetIndex = completedMigrations.findIndex(
          (m) => m.id === target,
        );
        return targetIndex >= 0
          ? completedMigrations.slice(0, targetIndex + 1)
          : [];
      }
      return completedMigrations.slice(-1); // Only rollback last migration
    }
  }

  async runSingleMigration(connection, migration, direction) {
    const startTime = Date.now();

    try {
      logger.info(
        `${direction === "up" ? "⬆️" : "⬇️"} Running migration: ${migration.name}`,
      );

      // Start transaction
      const session = await connection.startSession();
      await session.withTransaction(async () => {
        if (direction === "up") {
          await migration.up(connection, session);
        } else {
          await migration.down(connection, session);
        }
      });

      const executionTime = Date.now() - startTime;

      // Record migration
      await this.recordMigration(
        connection,
        migration,
        direction,
        executionTime,
      );

      logger.info(
        `✅ Migration completed: ${migration.name} (${executionTime}ms)`,
      );
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(
        `❌ Migration failed: ${migration.name} (${executionTime}ms)`,
        {
          error: error.message,
          stack: error.stack,
        },
      );
      throw error;
    }
  }

  async recordMigration(connection, migration, direction, executionTime) {
    const Migration = connection.model(
      "Migration",
      new mongoose.Schema({
        id: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        description: { type: String },
        executedAt: { type: Date, default: Date.now },
        executionTime: { type: Number },
        direction: { type: String, enum: ["up", "down"] },
        checksum: { type: String },
      }),
      this.migrationCollection,
    );

    if (direction === "up") {
      await Migration.create({
        id: migration.id,
        name: migration.name,
        description: migration.description,
        executionTime,
        direction,
        checksum: this.generateChecksum(migration),
      });
    } else {
      await Migration.deleteOne({ id: migration.id });
    }
  }

  generateChecksum(migration) {
    const crypto = require("crypto");
    const content = migration.up.toString() + migration.down.toString();
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  async acquireLock(connection, migrationId) {
    const Lock = connection.model(
      "MigrationLock",
      new mongoose.Schema({
        _id: { type: String, default: "migration_lock" },
        isLocked: { type: Boolean, default: false },
        lockedBy: { type: String },
        lockedAt: { type: Date },
      }),
      this.lockCollection,
    );

    const maxAttempts = 60; // 5 minutes
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await Lock.findOneAndUpdate(
          { _id: "migration_lock", isLocked: false },
          {
            isLocked: true,
            lockedBy: migrationId,
            lockedAt: new Date(),
          },
          { upsert: true },
        );

        logger.debug(`🔒 Migration lock acquired: ${migrationId}`);
        return;
      } catch (error) {
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      }
    }

    throw new Error(
      "Could not acquire migration lock - another migration might be running",
    );
  }

  async releaseLock(connection, migrationId) {
    try {
      const Lock = connection.model(
        "MigrationLock",
        new mongoose.Schema({
          _id: { type: String, default: "migration_lock" },
          isLocked: { type: Boolean, default: false },
          lockedBy: { type: String },
          lockedAt: { type: Date },
        }),
        this.lockCollection,
      );

      await Lock.findOneAndUpdate(
        { _id: "migration_lock", lockedBy: migrationId },
        { isLocked: false, lockedBy: null, lockedAt: null },
      );

      logger.debug(`🔓 Migration lock released: ${migrationId}`);
    } catch (error) {
      logger.warn(`Failed to release migration lock: ${error.message}`);
    }
  }

  async status() {
    let connection = null;

    try {
      connection = await connectDatabase(baseConfig, "migration");

      const migrations = await this.loadMigrations();
      const completed = await this.getCompletedMigrations(connection);

      logger.info("\n📊 Migration Status:");
      logger.info("=".repeat(50));

      for (const migration of migrations) {
        const status = completed.includes(migration.id)
          ? "✅ Applied"
          : "⏳ Pending";
        logger.info(`${status} ${migration.name} - ${migration.description}`);
      }

      logger.info("=".repeat(50));
      logger.info(
        `Total: ${migrations.length}, Applied: ${completed.length}, Pending: ${migrations.length - completed.length}`,
      );
    } finally {
      if (connection) {
        await disconnectDatabase("migration");
      }
    }
  }
}

// CLI interface
const migrationManager = new MigrationManager();

async function main() {
  const [command = "up", target] = process.argv.slice(2); // ✅ FIXED: Use array destructuring

  try {
    switch (command) {
      case "up":
        await migrationManager.run("up", target);
        break;
      case "down":
        await migrationManager.run("down", target);
        break;
      case "status":
        await migrationManager.status();
        break;
      default:
        logger.info("Usage: node run.js [up|down|status] [target]");
        logger.info("  up     - Run pending migrations");
        logger.info("  down   - Rollback last migration");
        logger.info("  status - Show migration status");
        process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    logger.error(`Migration command failed: ${error.message}`);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MigrationManager };
export default migrationManager;