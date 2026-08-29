import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";

const DEFAULT_POOL_SIZE = 5;

type TransactionalRegistry = {
  databases: Map<string, TransactionalDatabase>;
  pools: Map<string, Pool>;
};

const globalForTransactionalDatabase = globalThis as typeof globalThis & {
  adaptiveWorldTransactionalRegistry?: TransactionalRegistry;
};

function assertPostgresUrl(databaseUrl: string): void {
  if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) {
    throw new TypeError("A PostgreSQL connection URL is required");
  }
}

function registry(): TransactionalRegistry {
  const existing = globalForTransactionalDatabase.adaptiveWorldTransactionalRegistry;
  if (existing) return existing;

  const created: TransactionalRegistry = {
    databases: new Map(),
    pools: new Map(),
  };
  globalForTransactionalDatabase.adaptiveWorldTransactionalRegistry = created;
  return created;
}

function createDrizzleDatabase(pool: Pool) {
  return drizzle({ client: pool, schema });
}

export type TransactionalDatabase = ReturnType<typeof createDrizzleDatabase>;
export type TransactionalPool = Pool;
export type { PoolClient };

/**
 * Returns one bounded node-postgres pool per connection URL in this process.
 *
 * Commerce code needs an acquired PoolClient so SELECT ... FOR UPDATE and all
 * dependent writes remain on one connection between BEGIN and COMMIT. The
 * existing Neon HTTP client remains preferable for independent read queries.
 */
export function createTransactionalPool(databaseUrl: string): TransactionalPool {
  assertPostgresUrl(databaseUrl);
  const pools = registry().pools;
  const existing = pools.get(databaseUrl);
  if (existing) return existing;

  const pool = new Pool({
    connectionString: databaseUrl,
    max: DEFAULT_POOL_SIZE,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  // Avoid an unhandled EventEmitter error from an idle connection. Active
  // query/transaction failures still reject the corresponding operation.
  pool.on("error", (error) => {
    console.error("Unexpected idle PostgreSQL connection error", { name: error.name });
  });
  pools.set(databaseUrl, pool);
  return pool;
}

/** Drizzle query builder backed by the same transaction-capable singleton pool. */
export function createTransactionalDatabase(databaseUrl: string): TransactionalDatabase {
  assertPostgresUrl(databaseUrl);
  const databases = registry().databases;
  const existing = databases.get(databaseUrl);
  if (existing) return existing;

  const database = createDrizzleDatabase(createTransactionalPool(databaseUrl));
  databases.set(databaseUrl, database);
  return database;
}
