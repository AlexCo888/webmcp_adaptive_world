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
/**
 * Upper bound for a confirmed routine request body. The schemas bound string
 * lengths in characters while the body limit is measured in UTF-8 bytes: the
 * largest schema-valid agent routine is roughly 19,000 characters, which is
 * about 56 KB in CJK text and can approach 112 KB when characters arrive as
 * JSON \u escapes. 128 KB covers every schema-valid encoding while remaining
 * a hard cap; other commerce endpoints keep the default 8 KB body.
 */
export const ROUTINE_REQUEST_MAX_BYTES = 128 * 1_024;
export const DEMO_AGENT_SUBJECT = "adaptive-demo-agent";

export const payableOrderStatuses = [
  "created",
  "provider_pending",
  "payment_submitted",
  "reconciliation_required",
  "paid_unfulfilled",
] as const;

export function canResumeRoutineProOrderStatus(status: string): boolean {
  // paid_unfulfilled resumes only local idempotent fulfillment; it never opens
  // or retries a payment rail.
  return ["created", "provider_pending", "paid_unfulfilled"].includes(status);
}
