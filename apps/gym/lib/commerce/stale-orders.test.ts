import { describe, expect, it, vi } from "vitest";
import type { RoutineProOrder } from "./orders";
import { releaseStaleRoutineProOrder } from "./stale-orders";

const mocks = vi.hoisted(() => ({
  cancelStripeCheckout: vi.fn(),
  releaseAgentReservationBeforeSubmission: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./stripe", () => ({ cancelStripeCheckout: mocks.cancelStripeCheckout }));
vi.mock("./budget", () => ({
  releaseAgentReservationBeforeSubmission: mocks.releaseAgentReservationBeforeSubmission,
}));
vi.mock("./database", () => ({ commercePool: { query: mocks.query } }));

const activeSession = "00000000-0000-4000-8000-000000000004";
const order = {
  id: "order-1",
  publicRef: `awrp_${"a".repeat(32)}`,
  patientId: "patient-1",
  gymSessionId: "00000000-0000-4000-8000-000000000001",
  provider: "mpp_tempo",
  status: "provider_pending",
} as RoutineProOrder;

describe("stale Routine Pro orders", () => {
  it("releases an unpaid order left by an earlier Gym session", async () => {
    await expect(releaseStaleRoutineProOrder(order, activeSession)).resolves.toBe(true);
    expect(mocks.releaseAgentReservationBeforeSubmission).toHaveBeenCalledWith(
      "order-1",
      "superseded_by_new_gym_session",
    );
    expect(mocks.cancelStripeCheckout).not.toHaveBeenCalled();
    expect(String(mocks.query.mock.calls[0]?.[0])).toContain("commerce.order.released_stale");
  });

  it("cancels an abandoned Stripe checkout the same way the owner would", async () => {
    await expect(
      releaseStaleRoutineProOrder({ ...order, provider: "stripe_checkout" }, activeSession),
    ).resolves.toBe(true);
    expect(mocks.cancelStripeCheckout).toHaveBeenCalledTimes(1);
  });

  it("never touches the active session's order or any submitted payment", async () => {
    mocks.releaseAgentReservationBeforeSubmission.mockClear();
    await expect(
      releaseStaleRoutineProOrder({ ...order, gymSessionId: activeSession }, activeSession),
    ).resolves.toBe(false);
    for (const status of ["payment_submitted", "reconciliation_required", "paid_unfulfilled"]) {
      await expect(
        releaseStaleRoutineProOrder(
          { ...order, status: status as RoutineProOrder["status"] },
          activeSession,
        ),
      ).resolves.toBe(false);
    }
    expect(mocks.releaseAgentReservationBeforeSubmission).not.toHaveBeenCalled();
  });
});
