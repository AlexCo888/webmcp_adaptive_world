import { createDatabase, createTransactionalDatabase } from "@adaptive-world/db";

const buildOnly = process.env.NEXT_PHASE === "phase-production-build" || process.env.CI === "true";

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (buildOnly) return "postgresql://build:build@127.0.0.1:5432/adaptive_world_build";
  throw new Error("DATABASE_URL is required at runtime");
}

const globalForDatabase = globalThis as typeof globalThis & {
  adaptiveGymDatabase?: ReturnType<typeof createDatabase>;
};

const resolvedDatabaseUrl = databaseUrl();

export const db = globalForDatabase.adaptiveGymDatabase ?? createDatabase(resolvedDatabaseUrl);
export const transactionalDb = createTransactionalDatabase(resolvedDatabaseUrl);

if (process.env.NODE_ENV !== "production") globalForDatabase.adaptiveGymDatabase = db;
