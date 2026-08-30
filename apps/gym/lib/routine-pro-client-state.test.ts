import { describe, expect, it } from "vitest";
import {
  isPendingPaymentError,
  pendingOrderStatusLabel,
  pendingPaymentMode,
  pendingRoutineProOrder,
} from "./routine-pro-client-state";

const pending = {
  entitled: false,
  orderRef: `awrp_${"a".repeat(32)}`,
  orderStatus: "provider_pending",
  payerLabel: "Human test checkout",
  canResume: true,
  initialTemplateId: "first_visit_foundations",
  initialGoal: "Support long-term health",
};

describe("Routine Pro client state", () => {
  it("accepts only a complete server-owned pending order projection", () => {
    const parsed = pendingRoutineProOrder(pending);
    expect(parsed).toMatchObject({
      orderRef: pending.orderRef,
      canResume: true,
      initialGoal: "Support long-term health",
    });
    expect(parsed && pendingPaymentMode(parsed)).toBe("human_checkout");
    expect(parsed && pendingOrderStatusLabel(parsed)).toBe("Ready to resume");
    expect(pendingRoutineProOrder({ ...pending, entitled: true })).toBeNull();
    expect(pendingRoutineProOrder({ ...pending, orderRef: "patient-123" })).toBeNull();
  });

  it("keeps non-resumable reconciliation visible without suggesting a retry", () => {
    const parsed = pendingRoutineProOrder({
      ...pending,
      orderStatus: "reconciliation_required",
      canResume: false,
    });
    expect(parsed && pendingOrderStatusLabel(parsed)).toBe(
      "Reconciliation required — retry disabled",
    );
  });

  it("does not trap a definitively voided checkout return in the pending UI", () => {
    expect(
      pendingRoutineProOrder({
        ...pending,
        orderStatus: "voided",
        canResume: false,
      }),
    ).toBeNull();
  });

  it("recognizes only resumable pending/setup races", () => {
    expect(isPendingPaymentError({ apiCode: "ORDER_PENDING" })).toBe(true);
    expect(isPendingPaymentError({ apiCode: "PROVIDER_SETUP_PENDING" })).toBe(true);
    expect(isPendingPaymentError({ apiCode: "RECONCILIATION_REQUIRED" })).toBe(false);
  });
});
