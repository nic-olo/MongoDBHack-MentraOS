import mongoose from 'mongoose';

let isConnected = false;

/**
 * Initialize MongoDB connection
 * Uses MONGO_URL from environment variables
 */
export async function initializeDatabase(): Promise<void> {
  if (isConnected) {
    console.log('[MongoDB] Already connected');
    return;
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    console.warn('[MongoDB] MONGODB_URI not set in environment variables. Chat history will not be persisted.');
    return;
  }

  try {
    mongoose.set('strictQuery', false);
    
    await mongoose.connect(MONGODB_URI);
    
    isConnected = true;
    console.log('[MongoDB] ✅ Connected successfully');
    
    // Handle connection events
    mongoose.connection.on('error', (error) => {
      console.error('[MongoDB] Connection error:', error);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[MongoDB] Disconnected');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('[MongoDB] Reconnected');
      isConnected = true;
    });

  } catch (error) {
    console.error('[MongoDB] Failed to connect:', error);
    console.warn('[MongoDB] Continuing without database. Chat history will not be persisted.');
    isConnected = false;
  }
}

/**
 * Check if MongoDB is connected
 */
export function isDatabaseConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Close MongoDB connection
 */
export async function closeDatabaseConnection(): Promise<void> {
  if (isConnected) {
    await mongoose.connection.close();
    isConnected = false;
    console.log('[MongoDB] Connection closed');
  }
}
