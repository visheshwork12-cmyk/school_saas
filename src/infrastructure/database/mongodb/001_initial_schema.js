// src/infrastructure/database/mongodb/migrations/001_initial_schema.js

import mongoose from "mongoose";
import { createIndexes } from "#infrastructure/database/mongodb/indexes.js";
import { logger } from "#utils/core/logger.js";

/**
 * @description Initial schema migration.
 * Creates collections and indexes.
 *
 * @example
 * await runMigration();
 */
const runMigration = async () => {
  try {
    // Load models to create collections
    require("#domain/models/platform/organization.model.js");
    require("#domain/models/platform/subscription.model.js");
    require("#domain/models/school/school.model.js");
    require("#domain/models/school/user.model.js");

    // Create indexes
    await createIndexes();

    logger.info("Initial schema migration completed");
  } catch (err) {
    logger.error(`Migration failed: ${err.message}`);
    throw err;
  }
};

export { runMigration };
