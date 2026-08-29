import assert from "node:assert/strict";

import { it as test } from "vitest";

import {
  createPostgresAtomicStore,
  type PostgresAtomicStoreDatabase,
  type PostgresQuery,
} from "./postgres-atomic-store";

type TestStoreMap = Record<string, unknown>;

test("Postgres update locks a missing key and round-trips bigint JSON", async () => {
  const calls: string[] = [];
  let valueJson: string | null = null;

  const query: PostgresQuery = <row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ) => {
    if (sql.includes("pg_advisory_xact_lock")) {
      calls.push("lock");
      return Promise.resolve({ rows: [] as row[] });
    }
    if (sql.includes("FOR UPDATE")) {
      calls.push("select-for-update");
      const rows = valueJson === null ? [] : [{ value_json: valueJson }];
      return Promise.resolve({ rows: rows as unknown as row[] });
    }
    if (sql.includes("INSERT INTO mpp_replay_store")) {
      calls.push("put");
      valueJson = parameters[1] as string;
      return Promise.resolve({ rows: [] as row[] });
    }
    if (sql.includes("SELECT value::text")) {
      calls.push("get");
      const rows = valueJson === null ? [] : [{ value_json: valueJson }];
      return Promise.resolve({ rows: rows as unknown as row[] });
    }
    throw new TypeError("Unexpected SQL");
  };
  const database: PostgresAtomicStoreDatabase = {
    query,
    withTransaction: (run) => run(query),
  };
  const store = createPostgresAtomicStore<TestStoreMap>(database, { keyPrefix: "gym:" });

  const outcome = await store.update("budget", (current) => {
    assert.equal(current, null);
    return { op: "set", result: "stored", value: { remaining: 5n } };
  });
  assert.equal(outcome, "stored");
  assert.deepEqual(calls, ["lock", "select-for-update", "put"]);
  assert.match(valueJson ?? "", /5#__bigint/u);
  assert.deepEqual(await store.get("budget"), { remaining: 5n });
  assert.equal(calls.at(-1), "get");
});

test("tryClaim takes the same advisory lock and uses one captured expiry", async () => {
  const calls: Array<Readonly<{ parameters: readonly unknown[]; sql: string }>> = [];
  const query: PostgresQuery = <row extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters: readonly unknown[] = [],
  ) => {
    calls.push({ parameters, sql });
    const rows = sql.includes("RETURNING key") ? [{ key: "gym:claim" }] : [];
    return Promise.resolve({ rows: rows as unknown as row[] });
  };
  const database: PostgresAtomicStoreDatabase = {
    query,
    withTransaction: (run) => run(query),
  };
  const store = createPostgresAtomicStore<TestStoreMap>(database, {
    keyPrefix: "gym:",
    now: () => 1_800_000_000_000,
  });

  const tryClaim = store.tryClaim;
  assert.ok(tryClaim);
  assert.equal(await tryClaim("claim", 1_800_000_060_000), true);
  assert.equal(calls.length, 2);
  const lockCall = calls[0];
  const claimCall = calls[1];
  assert.ok(lockCall);
  assert.ok(claimCall);
  assert.match(lockCall.sql, /pg_advisory_xact_lock/u);
  assert.match(claimCall.sql, /ON CONFLICT \(key\) DO UPDATE/u);
  assert.deepEqual(claimCall.parameters.slice(3), [1_800_000_060_000, 1_800_000_000_000]);
});
