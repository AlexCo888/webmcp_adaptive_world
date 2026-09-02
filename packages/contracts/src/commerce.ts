import { z } from "zod";

import { AgentGeneratedRoutineInputSchema, GeneratedSessionSchema } from "./equipment";

export const RoutineProProductKeySchema = z.literal("adaptive_world.routine_pro.v1");
export const RoutineTemplateIdSchema = z.enum([
  "first_visit_foundations",
  "low_impact_orientation",
  "accessible_equipment_tour",
]);
export const AgentGeneratedRoutineMarkerSchema = z.literal("webmcp_agent_generated");
export const RoutineProvenanceIdSchema = z.union([
  RoutineTemplateIdSchema,
  AgentGeneratedRoutineMarkerSchema,
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

const RoutineQuoteFieldsSchema = z.object({
  quoteValidUntil: z.string().datetime({ offset: true }),
  quoteDigest: z.string().regex(/^[0-9a-f]{64}$/),
});

/**
 * WebMCP intent: the user-selected external agent generated the exact routine
 * and the person confirmed that exact routine before submission.
 */
export const AgentRoutineIntentSchema = z
  .object({
    initiatedVia: z.literal("webmcp"),
    goal: RoutineGoalSchema,
    routine: AgentGeneratedRoutineInputSchema,
    paymentMode: RoutinePaymentModeSchema.optional(),
  })
  .strict();

/**
 * Site-UI intent: a person without an agent chooses a published staff
 * walkthrough. Gym grounds it in the active projection and verified inventory;
 * it is never presented as agent-generated or AI-personalized.
 */
export const StaffWalkthroughIntentSchema = z
  .object({
    initiatedVia: z.literal("site-ui"),
    goal: RoutineGoalSchema,
    templateId: RoutineTemplateIdSchema,
    paymentMode: RoutinePaymentModeSchema.optional(),
  })
  .strict();

export const PrepareRoutineRequestSchema = z.discriminatedUnion("initiatedVia", [
  AgentRoutineIntentSchema,
  StaffWalkthroughIntentSchema,
]);

export const ConfirmRoutineRequestSchema = z.discriminatedUnion("initiatedVia", [
  AgentRoutineIntentSchema.extend(RoutineQuoteFieldsSchema.shape).strict(),
  StaffWalkthroughIntentSchema.extend(RoutineQuoteFieldsSchema.shape).strict(),
]);

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

export const CommerceProviderSchema = z.enum(["mpp_tempo", "stripe_checkout"]);

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
    entitlementGranted: z.boolean().default(false),
    orderRef: z.string().max(64).optional(),
    orderStatus: CommerceOrderStateSchema.optional(),
    amountMinor: z.literal(499).optional(),
    currency: z.literal("usd").optional(),
    provider: CommerceProviderSchema.optional(),
    payerLabel: z.enum(["Human test checkout", "Adaptive World demo agent"]).optional(),
    sandbox: z.literal(true).optional(),
    initiatedVia: RoutineInitiationSchema.optional(),
    orderScope: z.enum(["active_session", "earlier_session"]).optional(),
    checkoutUrl: z.string().url().optional(),
    canResume: z.boolean().default(false),
    submittedAt: z.string().datetime({ offset: true }).optional(),
    paidAt: z.string().datetime({ offset: true }).optional(),
    fulfilledAt: z.string().datetime({ offset: true }).optional(),
    providerPaymentRef: z.string().min(1).max(255).optional(),
    routineSaved: z.boolean().default(false),
    routine: GeneratedSessionSchema.optional(),
    savedRoutineRef: z.string().max(64).optional(),
    initialGoal: RoutineGoalSchema.nullable().optional(),
  })
  .strict();

export const SavedRoutineSummarySchema = z
  .object({
    ref: z.string().max(64),
    title: z.string().min(2).max(120),
    templateId: RoutineProvenanceIdSchema,
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
export type RoutineProIntent = z.infer<typeof PrepareRoutineRequestSchema>;
export type PrepareRoutineRequest = RoutineProIntent;
export type ConfirmRoutineRequest = z.infer<typeof ConfirmRoutineRequestSchema>;
export type RoutineStatus = z.infer<typeof RoutineStatusSchema>;
export type CommerceSafeCode = z.infer<typeof CommerceSafeCodeSchema>;
export type SavedRoutineSummary = z.infer<typeof SavedRoutineSummarySchema>;
export type SavedRoutineDetail = z.infer<typeof SavedRoutineDetailSchema>;
