import { z } from "zod";

import { GeneratedSessionSchema } from "./equipment";

export const RoutineProProductKeySchema = z.literal("adaptive_world.routine_pro.v1");
export const RoutineTemplateIdSchema = z.enum([
  "first_visit_foundations",
  "low_impact_orientation",
  "accessible_equipment_tour",
]);
export const RoutinePaymentModeSchema = z.enum(["human_checkout", "agent_wallet"]);
export const RoutineInitiationSchema = z.enum(["site-ui", "webmcp"]);
export const RoutineGoalSchema = z.string().trim().min(2).max(160);

export const RoutineProOfferSchema = z
  .object({
    productKey: RoutineProProductKeySchema,
    displayName: z.literal("Adaptive Routine Pro"),
    amountMinor: z.literal(499),
    currency: z.literal("usd"),
    sandbox: z.literal(true),
    entitled: z.boolean(),
    supportedModes: z.array(RoutinePaymentModeSchema).max(2),
    quoteValidUntil: z.string().datetime({ offset: true }),
    quoteDigest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export const PrepareRoutineRequestSchema = z
  .object({
    templateId: RoutineTemplateIdSchema,
    goal: RoutineGoalSchema,
    paymentMode: RoutinePaymentModeSchema.optional(),
    initiatedVia: RoutineInitiationSchema.default("site-ui"),
  })
  .strict();

export const ConfirmRoutineRequestSchema = PrepareRoutineRequestSchema.extend({
  quoteValidUntil: z.string().datetime({ offset: true }),
  quoteDigest: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const CommerceOrderStateSchema = z.enum([
  "created",
  "provider_pending",
  "payment_submitted",
  "reconciliation_required",
  "paid_unfulfilled",
  "fulfilled",
  "failed",
  "expired",
  "voided",
  "duplicate_paid",
  "refund_pending",
  "refunded",
]);

export const CommerceSafeCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "CONTEXT_REQUIRED",
  "CONTEXT_EXPIRED",
  "PAYMENT_REQUIRED",
  "ALREADY_ENTITLED",
  "ORDER_PENDING",
  "ORDER_EXPIRED",
  "QUOTE_CHANGED",
  "ROUTINE_CONFLICT",
  "PRICE_MISMATCH",
  "PAYMENT_REPLAY",
  "BUDGET_EXCEEDED",
  "PROVIDER_SETUP_PENDING",
  "PROVIDER_SETUP_RECONCILIATION_REQUIRED",
  "PROVIDER_UNAVAILABLE",
  "RECONCILIATION_REQUIRED",
  "FULFILLMENT_PENDING",
  "PAYMENT_FAILED",
  "RATE_LIMITED",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "INTERNAL_ERROR",
]);

export const RoutineStatusSchema = z
  .object({
    entitled: z.boolean(),
    orderRef: z.string().max(64).optional(),
    orderStatus: CommerceOrderStateSchema.optional(),
    payerLabel: z.enum(["Human test checkout", "Adaptive World demo agent"]).optional(),
    checkoutUrl: z.string().url().optional(),
    canResume: z.boolean().default(false),
    routine: GeneratedSessionSchema.optional(),
    savedRoutineRef: z.string().max(64).optional(),
    initialGoal: RoutineGoalSchema.nullable().optional(),
  })
  .strict();

export const SavedRoutineSummarySchema = z
  .object({
    ref: z.string().max(64),
    title: z.string().min(2).max(120),
    templateId: RoutineTemplateIdSchema,
    templateVersion: z.string().min(1).max(24),
    savedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const SavedRoutineDetailSchema = SavedRoutineSummarySchema.extend({
  plan: GeneratedSessionSchema,
  catalogVersion: z.string().min(1).max(64),
}).strict();

export const SafeSuccessEnvelopeSchema = <T extends z.ZodType>(data: T) =>
  z
    .object({
      ok: z.literal(true),
      data,
      requestId: z.string().min(8).max(128),
    })
    .strict();

export const SafeErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: CommerceSafeCodeSchema,
        message: z.string().min(1).max(240),
        retryable: z.boolean(),
      })
      .strict(),
    requestId: z.string().min(8).max(128),
  })
  .strict();

export type RoutineProOffer = z.infer<typeof RoutineProOfferSchema>;
export type PrepareRoutineRequest = z.infer<typeof PrepareRoutineRequestSchema>;
export type ConfirmRoutineRequest = z.infer<typeof ConfirmRoutineRequestSchema>;
export type RoutineStatus = z.infer<typeof RoutineStatusSchema>;
export type CommerceSafeCode = z.infer<typeof CommerceSafeCodeSchema>;
export type SavedRoutineSummary = z.infer<typeof SavedRoutineSummarySchema>;
export type SavedRoutineDetail = z.infer<typeof SavedRoutineDetailSchema>;
