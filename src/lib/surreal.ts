import { Surreal, ConnectionStatus } from "surrealdb";
import { isServer } from "solid-js/web";

// Use serverEnv$ on the server, or handle differently if needed on client
// For simplicity here, we'll assume this module is primarily used server-side
// or that client-side usage won't directly instantiate the connection.

let connectionString: string | undefined;
let user: string | undefined;
let pass: string | undefined;
let ns: string | undefined;
let db: string | undefined;

if (isServer) {
  // In SolidStart, server-side env vars are accessed via process.env
  connectionString = process.env.DB_CONNECTION_URL;
  user = process.env.DB_USER;
  pass = process.env.DB_PASSWORD;
  ns = process.env.NAMESPACE;
  db = process.env.DB_NAME;

  if (!connectionString || !user || !pass || !ns || !db) {
    console.error("Missing SurrealDB environment variables on server!");
    throw new Error("Database configuration missing on server.");
  }
}

export const surrealDatabase = new Surreal();

// Initialize connection only once
let connectionPromise: Promise<Surreal> | null = null;

export function getSurrealConnection(): Promise<Surreal> {
  if (!isServer) {
    // Prevent client-side connection attempts if not desired
    return Promise.reject(
      new Error("Database connection can only be initiated server-side.")
    );
  }
  if (!connectionPromise) {
    // Throw error immediately if config is missing on server (checked above)
    if (!connectionString || !ns || !db || !user || !pass) {
      return Promise.reject(
        new Error("Server Database configuration missing.")
      );
    }
    connectionPromise = new Promise(async (resolve, reject) => {
      try {
        console.log("Attempting to connect to SurrealDB...");
        await surrealDatabase.connect(`${connectionString}/rpc`, {
          namespace: ns!,
          database: db!,
          auth: { username: user!, password: pass! },
        });
        console.log("SurrealDB connection successful.");
        resolve(surrealDatabase);
      } catch (e) {
        console.error("SurrealDB connection failed:", e);
        reject(e);
      }
    });
  }
  return connectionPromise;
}

// This function might be less useful if connection is server-only
export function getSurrealDbInstance(): Surreal | null {
  if (!isServer) return null; // Don't expose DB instance on client

  if (surrealDatabase.status !== ConnectionStatus.Connected) {
    console.warn("Attempting to get DB instance but status is not Connected.");
    // Should rely on getSurrealConnection promise
  }
  return surrealDatabase;
}
