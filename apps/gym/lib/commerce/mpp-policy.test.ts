import { describe, expect, it } from "vitest";
import {
  canClaimMppCredentialSubmission,
  resolveMppMerchantAction,
  resolveMppTimeoutOrderTransition,
} from "./mpp-policy";

describe("MPP merchant kill-switch policy", () => {
  it("blocks only new challenge issuance while payments are disabled", () => {
    expect(() =>
      resolveMppMerchantAction({
        agentPaymentsEnabled: false,
        hasCredential: false,
        orderStatus: "provider_pending",
      }),
    ).toThrow(/unavailable/u);
  });

  it("continues an already-submitted credential while issuance is disabled", () => {
    expect(
      resolveMppMerchantAction({
        agentPaymentsEnabled: false,
        hasCredential: true,
        orderStatus: "payment_submitted",
      }),
    ).toBe("submit_credential");
  });

  it("accepts a delayed credential after the agent marked its timeout for reconciliation", () => {
    expect(
      resolveMppMerchantAction({
        agentPaymentsEnabled: false,
        hasCredential: true,
        orderStatus: "reconciliation_required",
      }),
    ).toBe("submit_credential");
  });

  it("allows durable paid evidence to recover without a user context", () => {
    expect(
      resolveMppMerchantAction({
        agentPaymentsEnabled: false,
        hasCredential: false,
        orderStatus: "paid_unfulfilled",
      }),
    ).toBe("recover_fulfillment");
  });
});

describe("MPP timeout order transition", () => {
  it("permits exactly the reserved caller to claim credential broadcast", () => {
    expect(canClaimMppCredentialSubmission("reserved")).toBe(true);
    expect(canClaimMppCredentialSubmission("submitted")).toBe(false);
    expect(canClaimMppCredentialSubmission("reconciliation_required")).toBe(false);
  });

  it("never downgrades durable paid evidence to reconciliation", () => {
    expect(
      resolveMppTimeoutOrderTransition({
        orderStatus: "paid_unfulfilled",
        paidAt: new Date("2026-08-29T12:00:01.000Z"),
        providerPaymentRef: "0xpaid",
        receiptDigest: "a".repeat(64),
      }),
    ).toEqual({ failureCode: "FULFILLMENT_RETRY", status: "paid_unfulfilled" });
  });

  it("marks a submitted request without evidence for reconciliation", () => {
    expect(
      resolveMppTimeoutOrderTransition({
        orderStatus: "payment_submitted",
        paidAt: null,
        providerPaymentRef: null,
        receiptDigest: null,
      }),
    ).toEqual({ failureCode: "MPP_PAYMENT_AMBIGUOUS", status: "reconciliation_required" });
  });
});
