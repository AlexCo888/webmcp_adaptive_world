import { describe, expect, it } from "vitest";
import { createTransactionalDatabase, createTransactionalPool } from "../src";

describe("transaction-capable database client", () => {
  it("reuses one bounded pool for a database URL", () => {
    const databaseUrl = "postgresql://test:test@127.0.0.1:5432/adaptive_world_transaction_test";
    const first = createTransactionalPool(databaseUrl);
    const second = createTransactionalPool(databaseUrl);
    expect(second).toBe(first);
    expect(first.options.max).toBe(5);
  });

  it("reuses the same pool after making a legacy TLS alias explicit", () => {
    const legacyUrl = "postgresql://test:test@database.example.test/adaptive_world?sslmode=require";
    const explicitUrl =
      "postgresql://test:test@database.example.test/adaptive_world?sslmode=verify-full";
    expect(createTransactionalPool(legacyUrl)).toBe(createTransactionalPool(explicitUrl));
  });

  it("backs Drizzle with the same pool and exposes transaction support", () => {
    const databaseUrl = "postgresql://test:test@127.0.0.1:5432/adaptive_world_drizzle_test";
    const pool = createTransactionalPool(databaseUrl);
    const first = createTransactionalDatabase(databaseUrl);
    const second = createTransactionalDatabase(databaseUrl);
    expect(second).toBe(first);
    expect(first.$client).toBe(pool);
    expect(first.transaction.bind(first)).toBeTypeOf("function");
  });

  it("rejects non-PostgreSQL connection strings", () => {
    expect(() => createTransactionalPool("https://database.example.test")).toThrow(TypeError);
  });
});
