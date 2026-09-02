import { z } from "zod";

import { GeneratedSessionSchema } from "./equipment";

export const RoutineProProductKeySchema = z.literal("adaptive_world.routine_pro.v1");
export const RoutineTemplateIdSchema = z.enum([
  "first_visit_foundations",
  "low_impact_orientation",
  "accessible_equipment_tour",
]);
export const AgentGeneratedRoutineTemplateIdSchema = z.literal("webmcp_agent_generated");
export const PersistedRoutineTemplateIdSchema = z.union([
  RoutineTemplateIdSchema,
  AgentGeneratedRoutineTemplateIdSchema,
]);
export const RoutinePaymentModeSchema = z.enum(["human_checkout", "agent_wallet"]);
export const RoutineInitiationSchema = z.enum(["site-ui", "webmcp"]);
export const RoutineGoalSchema = z.string().trim().min(2).max(160);

export const AgentGeneratedRoutineSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    durationMinutes: z.number().int().min(10).max(120),
    exercises: z
      .array(
        z
          .object({
            equipmentId: z.string().min(1).max(128),
            durationMinutes: z.number().int().min(1).max(45),
            intensity: z.enum(["easy", "moderate"]),
            instructions: z.array(z.string().trim().min(2).max(220)).min(1).max(4),
            adaptationReason: z.string().trim().min(3).max(240),
          })
          .strict(),
      )
      .min(1)
      .max(12),
    warmup: z.array(z.string().trim().min(2).max(200)).max(6).optional(),
    cooldown: z.array(z.string().trim().min(2).max(200)).max(6).optional(),
    safetyNotes: z.array(z.string().trim().min(2).max(200)).max(8),
    requiresExpertReview: z.boolean(),
    expertReviewReason: z.string().trim().min(3).max(240).optional(),
  })
  .strict()
  .superRefine((routine, ctx) => {
    const totalExerciseMinutes = routine.exercises.reduce(
      (total, exercise) => total + exercise.durationMinutes,
      0,
    );
    if (totalExerciseMinutes > routine.durationMinutes) {
      ctx.addIssue({
        code: "custom",
        message: "Exercise minutes cannot exceed the routine duration.",
        path: ["durationMinutes"],
      });
    }
    const equipmentIds = routine.exercises.map((exercise) => exercise.equipmentId);
    if (new Set(equipmentIds).size !== equipmentIds.length) {
      ctx.addIssue({
        code: "custom",
        message: "Each equipment station may appear only once in a routine.",
        path: ["exercises"],
      });
    }
    if (routine.requiresExpertReview && !routine.expertReviewReason) {
      ctx.addIssue({
        code: "custom",
        message: "An expert-review reason is required when expert review is required.",
        path: ["expertReviewReason"],
      });
    }
  });

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
    goal: RoutineGoalSchema,
    routine: AgentGeneratedRoutineSchema,
    paymentMode: RoutinePaymentModeSchema.optional(),
    initiatedVia: z.literal("webmcp").default("webmcp"),
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
    amountMinor: z.literal(499).optional(),
    currency: z.literal("usd").optional(),
    provider: z.enum(["mpp_tempo", "stripe_checkout"]).optional(),
    payerLabel: z.enum(["Human test checkout", "Adaptive World demo agent"]).optional(),
    sandbox: z.literal(true).optional(),
    checkoutUrl: z.string().url().optional(),
    canResume: z.boolean().default(false),
    routine: GeneratedSessionSchema.optional(),
    savedRoutineRef: z.string().max(64).optional(),
    routineSaved: z.boolean().optional(),
    entitlementGranted: z.boolean().optional(),
    initialTemplateId: z.string().max(96).optional(),
    initialGoal: RoutineGoalSchema.nullable().optional(),
    providerPaymentRef: z.string().max(512).optional(),
    submittedAt: z.string().datetime({ offset: true }).optional(),
    paidAt: z.string().datetime({ offset: true }).optional(),
    fulfilledAt: z.string().datetime({ offset: true }).optional(),
    providerExplorerUrl: z.string().url().optional(),
  })
  .strict();

export const SavedRoutineSummarySchema = z
  .object({
    ref: z.string().max(64),
    title: z.string().min(2).max(120),
    templateId: PersistedRoutineTemplateIdSchema,
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

export type AgentGeneratedRoutine = z.infer<typeof AgentGeneratedRoutineSchema>;
export type RoutineProOffer = z.infer<typeof RoutineProOfferSchema>;
export type PrepareRoutineRequest = z.infer<typeof PrepareRoutineRequestSchema>;
export type ConfirmRoutineRequest = z.infer<typeof ConfirmRoutineRequestSchema>;
export type RoutineStatus = z.infer<typeof RoutineStatusSchema>;
export type CommerceSafeCode = z.infer<typeof CommerceSafeCodeSchema>;
export type SavedRoutineSummary = z.infer<typeof SavedRoutineSummarySchema>;
export type SavedRoutineDetail = z.infer<typeof SavedRoutineDetailSchema>;
