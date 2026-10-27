import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { connectDb, disconnectDb } from '../../src/db.js';

let memoryServer;

/**
 * Connects mongoose to a throw-away MongoDB.
 * - default: an in-memory mongod (downloaded once, then cached)
 * - set TEST_MONGODB_URI to use a real MongoDB instead (its DB gets wiped!)
 */
export async function startTestDb() {
  let uri = process.env.TEST_MONGODB_URI;
  if (!uri) {
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('clinic_booking_test');
  }
  await connectDb(uri);
}

export async function stopTestDb() {
  await disconnectDb();
  if (memoryServer) await memoryServer.stop();
}

export async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}
