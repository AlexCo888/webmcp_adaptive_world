import { RoutineTemplateIdSchema, type CommerceSafeCode } from "@adaptive-world/contracts";
import { z } from "zod";

const PendingOrderStatusSchema = z.enum([
  "created",
  "provider_pending",
  "payment_submitted",
  "reconciliation_required",
  "paid_unfulfilled",
]);

const PendingOrderSchema = z
  .object({
    entitled: z.literal(false),
    orderRef: z.string().regex(/^awrp_[a-f0-9]{32}$/),
    orderStatus: PendingOrderStatusSchema,
    payerLabel: z.enum(["Human test checkout", "Adaptive World demo agent"]),
    canResume: z.boolean(),
    initialTemplateId: RoutineTemplateIdSchema,
  })
  .passthrough();

export type PendingRoutineProOrder = Readonly<{
  orderRef: string;
  orderStatus: z.infer<typeof PendingOrderStatusSchema>;
  payerLabel: "Human test checkout" | "Adaptive World demo agent";
  canResume: boolean;
  initialTemplateId: z.infer<typeof RoutineTemplateIdSchema>;
}>;

export function pendingRoutineProOrder(value: unknown): PendingRoutineProOrder | null {
  const parsed = PendingOrderSchema.safeParse(value);
  if (!parsed.success) return null;
  return {
    orderRef: parsed.data.orderRef,
    orderStatus: parsed.data.orderStatus,
    payerLabel: parsed.data.payerLabel,
    canResume: parsed.data.canResume,
    initialTemplateId: parsed.data.initialTemplateId,
  };
}

export function pendingPaymentMode(
  pending: PendingRoutineProOrder,
): "human_checkout" | "agent_wallet" {
  return pending.payerLabel === "Human test checkout" ? "human_checkout" : "agent_wallet";
}

export function pendingOrderStatusLabel(pending: PendingRoutineProOrder): string {
  switch (pending.orderStatus) {
    case "created":
    case "provider_pending":
      return pending.canResume ? "Ready to resume" : "Preparing payment";
    case "payment_submitted":
      return "Payment submitted — reconciling";
    case "reconciliation_required":
      return "Reconciliation required — retry disabled";
    case "paid_unfulfilled":
      return "Paid — routine save pending";
    default:
      return "Order recorded — retry disabled";
  }
}

export function isPendingPaymentError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("apiCode" in error)) return false;
  return ["ORDER_PENDING", "PROVIDER_SETUP_PENDING"].includes(
    String((error as { apiCode?: CommerceSafeCode }).apiCode),
  );
}
