import {
  createTransactionalPool,
  type PoolClient,
  type TransactionalPool,
} from "@adaptive-world/db";

const buildOnly = process.env.NEXT_PHASE === "phase-production-build" || process.env.CI === "true";

export function commerceDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (buildOnly) return "postgresql://build:build@127.0.0.1:5432/adaptive_world_build";
  throw new Error("DATABASE_URL is required at runtime");
}

export const commercePool: TransactionalPool = createTransactionalPool(commerceDatabaseUrl());

export async function withCommerceTransaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await commercePool.connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the operation failure; pool eviction handles a broken client.
    }
    throw error;
  } finally {
    client.release();
  }
}
