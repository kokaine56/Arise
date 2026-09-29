import { MongoClient, Db as MongoDb, ClientSession } from 'mongodb';

export type Db = MongoDb;

let client: MongoClient | null = null;

export const openDatabase = async (): Promise<Db> => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  
  client = new MongoClient(uri);
  await client.connect();
  
  // Return the default database from the URI
  const db = client.db();
  
  // Drop the old incorrect index if it exists (fails silently if not)
  await db.collection('daily_records').dropIndex('goalId_1_date_1').catch(() => {});
  
  // Create necessary unique indexes
  await db.collection('daily_records').createIndex({ goal_id: 1, date: 1 }, { unique: true });
  
  return db;
};

export const closeDatabase = async (): Promise<void> => {
  if (client) {
    await client.close();
    client = null;
  }
};

/**
 * Run `fn` inside a transaction if replica sets are available.
 * For now, this simply executes the function asynchronously.
 */
export const transaction = async <T>(db: Db, fn: () => Promise<T>): Promise<T> => {
  if (!client) throw new Error('Database client not initialized');
  // Full MongoDB transactions require a replica set. 
  // We'll execute the function directly for this stage.
  return await fn();
};
