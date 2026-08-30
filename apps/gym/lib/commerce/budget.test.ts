import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  withCommerceTransaction: vi.fn(),
}));

vi.mock("./database", () => ({
  withCommerceTransaction: mocks.withCommerceTransaction,
}));

const patientId = "00000000-0000-4000-8000-000000000201";
const orderId = "00000000-0000-4000-8000-000000000202";
const bucketId = "00000000-0000-4000-8000-000000000203";
const reservationId = "00000000-0000-4000-8000-000000000204";
const setupId = "00000000-0000-4000-8000-000000000205";

type QueryRecord = { sql: string; values: readonly unknown[] | undefined };

function useClient(
  respond: (sql: string, values?: readonly unknown[]) => {
    rowCount?: number;
    rows?: unknown[];
  },
) {
  const queries: QueryRecord[] = [];
  const client = {
    query: vi.fn((sql: string, values?: readonly unknown[]) => {
      queries.push({ sql, values });
      const result = respond(sql, values);
      return { rowCount: result.rowCount ?? 1, rows: result.rows ?? [] };
    }),
  };
  mocks.withCommerceTransaction.mockImplementationOnce(
    async (operation: (transactionClient: typeof client) => Promise<unknown>) => operation(client),
  );
  return queries;
}

describe("agent budget durability transitions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("casts transition parameters to their Postgres enum types", async () => {
    const reservation = {
      id: reservationId,
      bucket_id: bucketId,
      order_id: orderId,
      amount_minor: 499,
      status: "reserved",
    };
    const queries = useClient((sql) => {
      if (sql.includes("SELECT abr.bucket_id")) {
        return { rows: [{ bucket_id: bucketId, patient_id: patientId }] };
      }
      if (sql.includes("SELECT paid_at")) {
        return {
          rows: [
            {
              paid_at: null,
              provider_payment_ref: null,
              receipt_digest: null,
              status: "provider_pending",
            },
          ],
        };
      }
      if (sql.includes("SELECT * FROM agent_budget_reservations")) {
        return { rows: [reservation] };
      }
      if (sql.includes("UPDATE agent_budget_reservations")) {
        return { rows: [{ ...reservation, status: "submitted" }] };
      }
      return { rows: [] };
    });

    const { markAgentPaymentSubmitted } = await import("./budget");
    await expect(markAgentPaymentSubmitted(orderId)).resolves.toMatchObject({
      orderId,
      status: "submitted",
    });

    const reservationUpdate = queries.find(({ sql }) =>
      sql.includes("UPDATE agent_budget_reservations"),
    );
    expect(reservationUpdate?.sql).toContain("$2::agent_budget_reservation_status");
    const orderUpdate = queries.find(({ sql }) => sql.includes("UPDATE commerce_orders SET status"));
    expect(orderUpdate?.sql).toContain("$2::commerce_order_status");
  });

  it("terminalizes a proven pre-submission MPP setup before releasing its budget", async () => {
    const reservation = {
      id: reservationId,
      bucket_id: bucketId,
      order_id: orderId,
      amount_minor: 499,
      status: "reserved",
    };
    const queries = useClient((sql) => {
      if (sql === "SELECT patient_id FROM commerce_orders WHERE id = $1") {
        return { rows: [{ patient_id: patientId }] };
      }
      if (sql.includes("SELECT active_provider_setup_id")) {
        return {
          rows: [
            {
              active_provider_setup_id: setupId,
              paid_at: null,
              provider: "mpp_tempo",
              provider_payment_ref: null,
              receipt_digest: null,
              status: "provider_pending",
              submitted_at: null,
            },
          ],
        };
      }
      if (sql.includes("FROM payment_provider_setups")) {
        return {
          rows: [
            {
              first_request_started_at: null,
              id: setupId,
              provider: "mpp_tempo",
              request_started_at: null,
              status: "attached",
            },
          ],
        };
      }
      if (sql.includes("SELECT * FROM agent_budget_reservations")) {
        return { rows: [reservation] };
      }
      return { rows: [] };
    });

    const { releaseAgentReservationBeforeSubmission } = await import("./budget");
    await expect(
      releaseAgentReservationBeforeSubmission(orderId, "agent_pay_mark_submitted_failed"),
    ).resolves.toBeUndefined();

    const setupUpdateIndex = queries.findIndex(({ sql }) =>
      sql.includes("UPDATE payment_provider_setups"),
    );
    const bucketLockIndex = queries.findIndex(({ sql }) =>
      sql.includes("SELECT id FROM agent_budget_buckets"),
    );
    expect(setupUpdateIndex).toBeGreaterThan(-1);
    expect(setupUpdateIndex).toBeLessThan(bucketLockIndex);
    expect(queries[setupUpdateIndex]?.sql).toContain("status = 'failed_terminal'");
    expect(queries[setupUpdateIndex]?.sql).toContain("first_request_started_at IS NULL");
  });
});
