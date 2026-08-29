import type { Store } from "mppx/server";

import { MPP_REPLAY_TABLE } from "./constants";
import { MppAdapterError } from "./errors";

export type PostgresQuery = <row extends Record<string, unknown> = Record<string, unknown>>(
  sql: string,
  parameters?: readonly unknown[],
) => Promise<Readonly<{ rowCount?: number | null; rows: readonly row[] }>>;

export interface PostgresAtomicStoreDatabase {
  query: PostgresQuery;
  /** Runs every callback query on one acquired PostgreSQL client and transaction. */
  withTransaction<result>(run: (query: PostgresQuery) => Promise<result>): Promise<result>;
}

export type PostgresAtomicStoreOptions = Readonly<{
  keyPrefix?: string;
  now?: () => number;
}>;

const BIGINT_SUFFIX = "#__bigint";
const MAX_DATE_MILLISECONDS = 8_640_000_000_000_000;

const LOCK_SQL = `
SELECT pg_advisory_xact_lock(
  hashtextextended($1::text, 0::bigint)
)
`;

const GET_SQL = `
SELECT value::text AS value_json
FROM ${MPP_REPLAY_TABLE}
WHERE key = $1
LIMIT 1
`;

const GET_FOR_UPDATE_SQL = `
SELECT value::text AS value_json
FROM ${MPP_REPLAY_TABLE}
WHERE key = $1
FOR UPDATE
`;

const PUT_SQL = `
INSERT INTO ${MPP_REPLAY_TABLE} (key, value, expires_at)
VALUES ($1, $2::jsonb, $3::timestamptz)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    expires_at = EXCLUDED.expires_at,
    updated_at = clock_timestamp()
`;

const DELETE_SQL = `
DELETE FROM ${MPP_REPLAY_TABLE}
WHERE key = $1
`;

const TRY_CLAIM_SQL = `
INSERT INTO ${MPP_REPLAY_TABLE} AS current_value (key, value, expires_at)
SELECT $1, $2::jsonb, $3::timestamptz
WHERE $3::timestamptz = to_timestamp($4::numeric / 1000)
  AND $4::numeric > GREATEST(
  $5::numeric,
  floor(extract(epoch FROM clock_timestamp()) * 1000)
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    expires_at = EXCLUDED.expires_at,
    updated_at = clock_timestamp()
WHERE current_value.value->>'type' = 'mppx:replay'
  AND current_value.expires_at IS NOT NULL
  AND current_value.expires_at <= clock_timestamp()
  AND CASE
    WHEN jsonb_typeof(current_value.value->'expires') = 'number'
    THEN (current_value.value->>'expires')::numeric <= LEAST(
      $5::numeric,
      floor(extract(epoch FROM clock_timestamp()) * 1000)
    )
    ELSE false
  END
RETURNING key
`;

type StoredRow = { value_json: unknown };

function serialize(value: unknown): string {
  try {
    const encoded = JSON.stringify(value, (_key, item: unknown) =>
      typeof item === "bigint" ? `${String(item)}${BIGINT_SUFFIX}` : item,
    );
    if (encoded === undefined) throw new TypeError("Unsupported store value");
    return encoded;
  } catch {
    throw new MppAdapterError("PROVIDER_UNAVAILABLE");
  }
}

function deserialize(valueJson: unknown): unknown {
  if (typeof valueJson !== "string") throw new MppAdapterError("PROVIDER_UNAVAILABLE");
  try {
    return JSON.parse(valueJson, (_key, item: unknown) => {
      if (typeof item !== "string" || !item.endsWith(BIGINT_SUFFIX)) return item;
      const bigintValue = item.slice(0, -BIGINT_SUFFIX.length);
      return /^-?(?:0|[1-9][0-9]*)$/u.test(bigintValue) ? BigInt(bigintValue) : item;
    }) as unknown;
  } catch {
    throw new MppAdapterError("PROVIDER_UNAVAILABLE");
  }
}

function replayExpiry(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "mppx:replay") return null;
  validateExpires(candidate.expires as number);
  return new Date(candidate.expires as number).toISOString();
}

function validateExpires(expires: number): void {
  if (!Number.isSafeInteger(expires) || expires < 0 || expires > MAX_DATE_MILLISECONDS) {
    throw new MppAdapterError("PROVIDER_UNAVAILABLE");
  }
}

function keyFor(key: string, prefix: string): string {
  const prefixed = `${prefix}${key}`;
  if (prefixed.length === 0 || prefixed.length > 512) {
    throw new MppAdapterError("PROVIDER_UNAVAILABLE");
  }
  return prefixed;
}

async function lockKey(query: PostgresQuery, key: string): Promise<void> {
  await query(LOCK_SQL, [key]);
}

export function createPostgresAtomicStore<itemMap extends Store.StoreItemMap = Store.StoreItemMap>(
  database: PostgresAtomicStoreDatabase,
  options: PostgresAtomicStoreOptions = {},
): Store.AtomicStore<itemMap> {
  const prefix = options.keyPrefix ?? "";
  const now = options.now ?? Date.now;

  const get: Store.StoreActions<itemMap>["get"] = async (key) => {
    const storedKey = keyFor(key, prefix);
    const result = await database.query<StoredRow>(GET_SQL, [storedKey]);
    const row = result.rows[0];
    return (row ? deserialize(row.value_json) : null) as itemMap[typeof key] | null;
  };

  const put: Store.StoreActions<itemMap>["put"] = async (key, value) => {
    const storedKey = keyFor(key, prefix);
    await database.withTransaction(async (query) => {
      await lockKey(query, storedKey);
      await query(PUT_SQL, [storedKey, serialize(value), replayExpiry(value)]);
    });
  };

  const deleteValue: Store.StoreActions<itemMap>["delete"] = async (key) => {
    const storedKey = keyFor(key, prefix);
    await database.withTransaction(async (query) => {
      await lockKey(query, storedKey);
      await query(DELETE_SQL, [storedKey]);
    });
  };

  const update: Store.Update<itemMap> = async (key, transform) => {
    const storedKey = keyFor(key, prefix);
    return database.withTransaction(async (query) => {
      await lockKey(query, storedKey);
      const selected = await query<StoredRow>(GET_FOR_UPDATE_SQL, [storedKey]);
      const row = selected.rows[0];
      const current = (row ? deserialize(row.value_json) : null) as itemMap[typeof key] | null;
      const change = transform(current);

      switch (change.op) {
        case "noop":
          return change.result;
        case "delete":
          await query(DELETE_SQL, [storedKey]);
          return change.result;
        case "set":
          await query(PUT_SQL, [storedKey, serialize(change.value), replayExpiry(change.value)]);
          return change.result;
        default:
          throw new MppAdapterError("PROVIDER_UNAVAILABLE");
      }
    });
  };

  const tryClaim: Store.TryClaim<itemMap> = async (key, expires) => {
    validateExpires(expires);
    const storedKey = keyFor(key, prefix);
    const capturedNow = now();
    validateExpires(capturedNow);
    const marker: Store.ReplayMarker = { expires, type: "mppx:replay" };

    return database.withTransaction(async (query) => {
      await lockKey(query, storedKey);
      const result = await query<{ key: string }>(TRY_CLAIM_SQL, [
        storedKey,
        serialize(marker),
        new Date(expires).toISOString(),
        expires,
        capturedNow,
      ]);
      return result.rows.length === 1;
    });
  };

  return { delete: deleteValue, get, put, tryClaim, update };
}
