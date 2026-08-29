export const ROUTINE_PRO = {
  productKey: "adaptive_world.routine_pro.v1",
  entitlementKey: "adaptive_world.routine_pro.v1",
  displayName: "Adaptive Routine Pro",
  amountMinor: 499,
  currency: "usd",
  sandbox: true,
} as const;

export const STRIPE_IDEMPOTENCY_REPLAY_WINDOW_MS = 23 * 60 * 60 * 1_000;
export const MPP_PAYMENT_WINDOW_MS = 5 * 60 * 1_000;
export const QUOTE_WINDOW_MS = 5 * 60 * 1_000;
export const DEMO_AGENT_SUBJECT = "adaptive-demo-agent";

export const payableOrderStatuses = [
  "created",
  "provider_pending",
  "payment_submitted",
  "reconciliation_required",
  "paid_unfulfilled",
] as const;
