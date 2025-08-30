// tests/setup/test.setup.js

import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { logger } from '#utils/core/logger.js';

let mongoServer;

/**
 * @description Jest global setup for in-memory MongoDB.
 */
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
  logger.info('Test DB connected');
});

/**
 * @description Cleanup after all tests.
 */
afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  logger.info('Test DB disconnected');
});

/**
 * @description Clear DB after each test.
 */
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});