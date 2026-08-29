import { CommerceError } from "./http";

export type MppMerchantAction = "issue_challenge" | "submit_credential" | "recover_fulfillment";

export type MppTimeoutOrderTransition = Readonly<{
  failureCode: "FULFILLMENT_RETRY" | "MPP_PAYMENT_AMBIGUOUS";
  status: "paid_unfulfilled" | "reconciliation_required";
}>;

export function canClaimMppCredentialSubmission(reservationStatus: string): boolean {
  return reservationStatus === "reserved";
}

export function resolveMppTimeoutOrderTransition({
  orderStatus,
  paidAt,
  providerPaymentRef,
  receiptDigest,
}: {
  orderStatus: string;
  paidAt: Date | null;
  providerPaymentRef: string | null;
  receiptDigest: string | null;
}): MppTimeoutOrderTransition | null {
  const hasCompleteEvidence = Boolean(providerPaymentRef && receiptDigest && paidAt);
  if (
    hasCompleteEvidence &&
    ["payment_submitted", "reconciliation_required", "paid_unfulfilled"].includes(orderStatus)
  ) {
    return { failureCode: "FULFILLMENT_RETRY", status: "paid_unfulfilled" };
  }
  if (orderStatus === "payment_submitted" || orderStatus === "reconciliation_required") {
    return { failureCode: "MPP_PAYMENT_AMBIGUOUS", status: "reconciliation_required" };
  }
  return null;
}

export function resolveMppMerchantAction({
  agentPaymentsEnabled,
  hasCredential,
  orderStatus,
}: {
  agentPaymentsEnabled: boolean;
  hasCredential: boolean;
  orderStatus: string;
}): MppMerchantAction {
  // Durable provider evidence is already authoritative. Recovery performs no
  // new provider call and must remain available while purchase issuance is off.
  if (orderStatus === "paid_unfulfilled") return "recover_fulfillment";

  // A submitted credential may already have left this process. Disabling new
  // purchases must not prevent the merchant from learning its final outcome.
  if (
    (orderStatus === "payment_submitted" || orderStatus === "reconciliation_required") &&
    hasCredential
  ) {
    return "submit_credential";
  }

  if (orderStatus === "provider_pending" && !hasCredential) {
    if (!agentPaymentsEnabled) throw new CommerceError("PROVIDER_UNAVAILABLE");
    return "issue_challenge";
  }

  throw new CommerceError("RECONCILIATION_REQUIRED");
}
