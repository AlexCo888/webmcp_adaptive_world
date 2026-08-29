import type Stripe from "stripe";
import type { RoutineProOrder } from "./orders";

export type StripeSetupClaimAction = "active" | "reconciliation" | "expired";
export type StripeSessionAttachAction =
  "attach" | "already_attached" | "pending" | "terminal" | "reconciliation";

export type StripeDuplicateRefundResolution = Readonly<{
  failureCode: string | null;
  outcome: "refunded" | "pending" | "reconciliation_required";
  persistReference: boolean;
}>;

export function retrieveOrCreateStripeRefund({
  create,
  refundReference,
  retrieve,
}: {
  create: () => Promise<Stripe.Refund>;
  refundReference: string | null;
  retrieve: (refundReference: string) => Promise<Stripe.Refund>;
}): Promise<Stripe.Refund> {
  return refundReference ? retrieve(refundReference) : create();
}

export function stripeRefundPaymentIntentId(refund: Stripe.Refund): string | null {
  return typeof refund.payment_intent === "string"
    ? refund.payment_intent
    : (refund.payment_intent?.id ?? null);
}

export function resolveStripeDuplicateRefund({
  order,
  refund,
}: {
  order: Pick<
    RoutineProOrder,
    "amountMinor" | "currency" | "provider" | "providerPaymentRef" | "refundReference" | "status"
  >;
  refund: Stripe.Refund;
}): StripeDuplicateRefundResolution {
  const paymentIntent = stripeRefundPaymentIntentId(refund);
  const validAuthority =
    order.provider === "stripe_checkout" &&
    ["duplicate_paid", "refund_pending", "refunded"].includes(order.status) &&
    Boolean(order.providerPaymentRef) &&
    paymentIntent === order.providerPaymentRef &&
    refund.object === "refund" &&
    refund.id.length > 0 &&
    refund.id.length <= 255 &&
    refund.amount === order.amountMinor &&
    refund.currency === order.currency &&
    (!order.refundReference || order.refundReference === refund.id);
  if (!validAuthority) {
    return {
      failureCode: "DUPLICATE_REFUND_IDENTITY_MISMATCH",
      outcome: "reconciliation_required",
      persistReference: false,
    };
  }
  if (refund.status === "succeeded") {
    return { failureCode: null, outcome: "refunded", persistReference: true };
  }
  if (refund.status === "pending" || refund.status === "requires_action") {
    return {
      failureCode: `DUPLICATE_REFUND_${refund.status.toUpperCase()}`,
      outcome: "pending",
      persistReference: true,
    };
  }
  return {
    failureCode: `DUPLICATE_REFUND_${
      refund.status === "failed" || refund.status === "canceled"
        ? refund.status.toUpperCase()
        : "UNKNOWN"
    }`,
    outcome: "reconciliation_required",
    persistReference: true,
  };
}

export function resolveStripeSetupClaimAction({
  activeProviderSetupId,
  orderProvider,
  orderStatus,
  setupId,
  setupStatus,
}: {
  activeProviderSetupId: string | null;
  orderProvider: string | null;
  orderStatus: string;
  setupId: string;
  setupStatus: string;
}): StripeSetupClaimAction {
  if (orderProvider !== "stripe_checkout" || activeProviderSetupId !== setupId) {
    return "expired";
  }
  if (orderStatus === "reconciliation_required" || setupStatus === "reconciliation_required") {
    return "reconciliation";
  }
  if (
    orderStatus !== "provider_pending" ||
    !["prepared", "requesting", "attached"].includes(setupStatus)
  ) {
    return "expired";
  }
  return "active";
}

export function resolveStripeSessionAttachAction({
  activeProviderSetupId,
  claimantLeaseOwnerHash,
  orderProvider,
  orderStatus,
  providerResourceId,
  sessionId,
  setupId,
  setupLeaseOwnerHash,
  setupStatus,
}: {
  activeProviderSetupId: string | null;
  claimantLeaseOwnerHash: string;
  orderProvider: string | null;
  orderStatus: string;
  providerResourceId: string | null;
  sessionId: string;
  setupId: string;
  setupLeaseOwnerHash: string | null;
  setupStatus: string;
}): StripeSessionAttachAction {
  if (["voided", "expired", "failed"].includes(orderStatus) || setupStatus === "failed_terminal") {
    return "terminal";
  }
  if (
    orderProvider !== "stripe_checkout" ||
    orderStatus !== "provider_pending" ||
    activeProviderSetupId !== setupId
  ) {
    return "reconciliation";
  }
  if (setupStatus === "attached") {
    return providerResourceId === sessionId ? "already_attached" : "reconciliation";
  }
  if (setupStatus !== "requesting" || providerResourceId !== null) {
    return "reconciliation";
  }
  return setupLeaseOwnerHash === claimantLeaseOwnerHash ? "attach" : "pending";
}

export function isStripeCheckoutAlreadyTerminalized({
  orderStatus,
  providerResourceId,
  sessionId,
  setupStatus,
}: {
  orderStatus: string;
  providerResourceId: string | null;
  sessionId: string;
  setupStatus: string;
}): boolean {
  return (
    ["voided", "expired"].includes(orderStatus) &&
    setupStatus === "failed_terminal" &&
    providerResourceId === sessionId
  );
}

export function shouldAttemptDuplicateStripeRefund(
  fulfillmentOutcome: "fulfilled" | "idempotent" | "duplicate_paid",
  order: Pick<RoutineProOrder, "provider" | "status"> | null,
): boolean {
  return (
    order?.provider === "stripe_checkout" &&
    (fulfillmentOutcome === "duplicate_paid" ||
      order.status === "duplicate_paid" ||
      order.status === "refund_pending")
  );
}
