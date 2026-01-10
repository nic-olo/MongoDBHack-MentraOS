/**
 * MongoDB Connection Module
 * Handles connection to MongoDB Atlas for persisting tasks and subagent state
 */

import { MongoClient, Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Connect to MongoDB
 * Call this once on server startup
 */
export async function connectMongo(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable not set");
  }

  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("mentraos");

    // Verify connection
    await db.command({ ping: 1 });
    console.log("[MongoDB] Connected to database");

    // Create indexes for common queries
    await createIndexes(db);

    return db;
  } catch (error) {
    console.error("[MongoDB] Failed to connect:", error);
    throw error;
  }
}

/**
 * Get the database instance
 * Throws if not connected
 */
export function getDb(): Db {
  if (!db) {
    throw new Error("MongoDB not connected. Call connectMongo() first.");
  }
  return db;
}

/**
 * Check if MongoDB is connected
 */
export function isConnected(): boolean {
  return db !== null && client !== null;
}

/**
 * Close MongoDB connection
 * Call this on server shutdown
 */
export async function closeMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log("[MongoDB] Connection closed");
  }
}

/**
 * Create indexes for performance
 */
async function createIndexes(db: Db): Promise<void> {
  try {
    // Subagents collection indexes
    await db.collection("subagents").createIndexes([
      { key: { agentId: 1 }, unique: true },
      { key: { daemonId: 1 } },
      { key: { userId: 1 } },
      { key: { sessionId: 1 } },
      { key: { status: 1 } },
      { key: { createdAt: -1 } },
    ]);

    // Tasks collection indexes
    await db.collection("tasks").createIndexes([
      { key: { taskId: 1 }, unique: true },
      { key: { userId: 1 } },
      { key: { status: 1 } },
      { key: { createdAt: -1 } },
    ]);

    console.log("[MongoDB] Indexes created");
  } catch (error) {
    // Indexes might already exist, that's fine
    console.log("[MongoDB] Indexes already exist or failed to create:", error);
  }
}
