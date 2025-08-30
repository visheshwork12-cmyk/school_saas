import { connectDatabase, disconnectDatabase } from '#shared/database/connection-manager.js';
import baseConfig from '#shared/config/environments/base.config.js';
import { logger } from '#utils/core/logger.js';
import { runSeed as platformSeed } from './platform-seed.js';

/**
 * Seed runner - populates database with initial data
 */
const runSeeds = async () => {
  try {
    logger.info('Starting database seeding...');
    
    // Connect to database
    await connectDatabase(baseConfig, 'seeding');
    
    // Run seeds in order
    const seeds = [
      { name: 'platform-seed', fn: platformSeed },
      // Add more seeds here
    ];
    
    for (const seed of seeds) {
      logger.info(`Running seed: ${seed.name}`);
      await seed.fn();
      logger.info(`Completed seed: ${seed.name}`);
    }
    
    logger.info('All seeds completed successfully');
    
  } catch (error) {
    logger.error(`Seeding failed: ${error.message}`);
    process.exit(1);
  } finally {
    await disconnectDatabase('seeding');
    process.exit(0);
  }
};

// Run seeds
runSeeds();
