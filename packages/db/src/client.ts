import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export function createDatabase(databaseUrl: string) {
  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    throw new TypeError("A PostgreSQL connection URL is required");
  }
  return drizzle({ client: neon(databaseUrl), schema });
}

export type Database = ReturnType<typeof createDatabase>;
