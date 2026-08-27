import { createDatabase } from "@adaptive-world/db";

const buildOnly = process.env.NEXT_PHASE === "phase-production-build" || process.env.CI === "true";

function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (value) return value;
  if (buildOnly) return "postgresql://build:build@127.0.0.1:5432/adaptive_world_build";
  throw new Error("DATABASE_URL is required at runtime");
}

const globalForDatabase = globalThis as typeof globalThis & {
  adaptiveWorldDatabase?: ReturnType<typeof createDatabase>;
};

export const db = globalForDatabase.adaptiveWorldDatabase ?? createDatabase(getDatabaseUrl());

if (process.env.NODE_ENV !== "production") globalForDatabase.adaptiveWorldDatabase = db;
