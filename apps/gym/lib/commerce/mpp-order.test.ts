import { afterEach, describe, expect, it, vi } from "vitest";

import { sha256Hex } from "@adaptive-world/security";
import type { RoutineProOrder } from "./orders";

const mocks = vi.hoisted(() => ({
  withCommerceTransaction: vi.fn(),
}));

vi.mock("./database", () => ({
  commercePool: { query: vi.fn() },
  withCommerceTransaction: mocks.withCommerceTransaction,
}));

const orderId = "00000000-0000-4000-8000-000000000101";
const patientId = "00000000-0000-4000-8000-000000000102";
const setupId = "00000000-0000-4000-8000-000000000103";
const preparedAt = new Date("2026-08-30T12:00:00.000Z");

describe("MPP order persistence", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("binds JSONB and canonical text separately so the database hashes exact bytes", async () => {
    vi.stubEnv("ENABLE_ROUTINE_PRO", "true");
    vi.stubEnv("ENABLE_AGENT_MPP_PAYMENT", "true");
    vi.stubEnv("COMMERCE_CAPABILITY_SECRET", "c".repeat(32));
    vi.stubEnv("MPP_TEMPO_CURRENCY", `0x${"1".repeat(40)}`);
    vi.stubEnv("MPP_TEMPO_RECIPIENT", `0x${"2".repeat(40)}`);
    vi.stubEnv("NEXT_PUBLIC_GYM_URL", "https://gym.example.test");

    const queries: Array<{ sql: string; values: readonly unknown[] | undefined }> = [];
    const client = {
      query: vi.fn((sql: string, values?: readonly unknown[]) => {
        queries.push({ sql, values });
        if (sql.includes("SELECT patient_id FROM commerce_orders")) {
          return { rowCount: 1, rows: [{ patient_id: patientId }] };
        }
        if (sql.includes("SELECT * FROM commerce_orders")) {
          return {
            rowCount: 1,
            rows: [
              {
                id: orderId,
                patient_id: patientId,
                public_ref: "awrp_regression_test",
                provider: "mpp_tempo",
                status: "provider_pending",
                amount_minor: 499,
                currency: "usd",
                capability_version: null,
                capability_digest: null,
                capability_expires_at: null,
              },
            ],
          };
        }
        if (sql.includes("FROM payment_provider_setups")) {
          return { rowCount: 0, rows: [] };
        }
        if (sql.includes("clock_timestamp()")) {
          return { rowCount: 1, rows: [{ now: preparedAt }] };
        }
        if (sql.includes("INSERT INTO payment_provider_setups")) {
          return { rowCount: 1, rows: [{ id: setupId }] };
        }
        if (sql.includes("UPDATE commerce_orders SET capability_version")) {
          return { rowCount: 1, rows: [] };
        }
        return { rowCount: 1, rows: [{ id: patientId }] };
      }),
    };
    mocks.withCommerceTransaction.mockImplementationOnce(
      async (operation: (transactionClient: typeof client) => Promise<unknown>) =>
        operation(client),
    );

    const { prepareMppOrder } = await import("./mpp-order");
    const prepared = await prepareMppOrder({
      id: orderId,
      provider: "mpp_tempo",
    } as RoutineProOrder);

    const insert = queries.find(({ sql }) => sql.includes("INSERT INTO payment_provider_setups"));
    expect(insert?.sql).toContain("$3::jsonb,$4,$5,$6,$7,$6");
    expect(insert?.values).toHaveLength(7);
    expect(insert?.values?.[2]).toBe(insert?.values?.[3]);
    expect(insert?.values?.[4]).toBe(await sha256Hex(String(insert?.values?.[3])));
    expect(prepared.offerCanonical).toBe(insert?.values?.[3]);
    expect(prepared.offerFingerprint).toBe(insert?.values?.[4]);
  });
});
