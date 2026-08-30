import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { normalizePostgresConnectionUrl } from "./connection-url";

export function createDatabase(databaseUrl: string) {
  return drizzle({ client: neon(normalizePostgresConnectionUrl(databaseUrl)), schema });
}

export type Database = ReturnType<typeof createDatabase>;
