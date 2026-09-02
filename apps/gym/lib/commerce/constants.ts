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
 * Upper bound for a confirmed routine request body. A schema-valid agent
 * routine (12 exercises, 5 instructions of 180 characters each, notes,
 * warm-up, cooldown, and quote fields) can exceed 20 KB, so the routine
 * endpoints accept more than the default 8 KB commerce body.
 */
export const ROUTINE_REQUEST_MAX_BYTES = 32 * 1_024;
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
