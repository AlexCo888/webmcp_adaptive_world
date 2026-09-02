import type {
  Equipment,
  GymContextProjection,
  RoutinePaymentModeSchema,
  RoutineProOffer,
} from "@adaptive-world/contracts";
import type { z } from "zod";
import type {
  CreatePersonalizedRoutineInput,
  MutationConfirmationRequest,
  RecordSessionFeedbackInput,
  WebMCPMutationPreparation,
} from "@adaptive-world/webmcp";
import { EXPERT_REVIEW_WARNING, type FacilityTemplate } from "./session-planner";

export type PreparedRoutineProConfirmation = Readonly<{
  effectiveInput: CreatePersonalizedRoutineInput;
  preparation: WebMCPMutationPreparation;
}>;

function summarize(values: readonly string[], fallback: string, max = 520): string {
  const value = values.length ? values.join("; ") : fallback;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

type PaymentMode = z.infer<typeof RoutinePaymentModeSchema> | undefined;

/**
 * Every confirmation field value must stay within the WebMCP adapter's
 * per-field bound (1,800 characters). The combined context summary is the only
 * value assembled from several independently bounded lists, so it is capped
 * as a whole after each list is summarized.
 */
export const MAX_CONFIRMATION_VALUE_CHARS = 1_600;
/** The WebMCP adapter's per-field bound; complete routine arrays fit within it. */
export const MAX_CONFIRMATION_FIELD_CHARS = 1_800;

function contextSummaryFor(projection: GymContextProjection): string {
  const value = [
    `Projection ${projection.projectionId}`,
    `Goals: ${summarize(projection.goals, "None", 320)}`,
    `Movement considerations: ${summarize(projection.movementConsiderations, "None", 400)}`,
    `Avoid: ${summarize(projection.avoid, "None", 320)}`,
    `Stop signals: ${summarize(projection.stopSignals, "None", 400)}`,
  ].join(" · ");
  return value.length <= MAX_CONFIRMATION_VALUE_CHARS
    ? value
    : `${value.slice(0, MAX_CONFIRMATION_VALUE_CHARS - 1)}…`;
}

function payerLabelFor(offer: RoutineProOffer, paymentMode: PaymentMode): string {
  return offer.entitled
    ? "Existing Passport entitlement"
    : paymentMode === "agent_wallet"
      ? "Adaptive World demo agent wallet"
      : "Human Stripe test checkout";
}

function paymentNetworkFor(offer: RoutineProOffer, paymentMode: PaymentMode): string {
  return offer.entitled
    ? "No new payment"
    : paymentMode === "agent_wallet"
      ? "MPP / Tempo testnet — sandbox transaction"
      : "Stripe test mode — sandbox transaction";
}

export type RoutineConfirmationField = Readonly<{ label: string; value: string }>;

/**
 * First-party confirmation for a person buying Routine Pro on the Gym site
 * without an agent. It shows the exact published walkthrough, the approved
 * context it will be grounded in, the price, payer, sandbox network, and the
 * Passport destination, and it never describes the result as agent-generated.
 */
export function prepareStaffWalkthroughConfirmation({
  offer,
  template,
  goal,
  paymentMode,
  projection,
  equipment,
}: {
  offer: RoutineProOffer;
  template: FacilityTemplate;
  goal: string;
  paymentMode: PaymentMode;
  projection: GymContextProjection;
  equipment: readonly Equipment[];
}): Readonly<{
  title: string;
  description: string;
  fields: readonly RoutineConfirmationField[];
  confirmLabel: string;
}> {
  return {
    title: offer.entitled
      ? "Save this staff walkthrough to Passport?"
      : "Approve this staff walkthrough and sandbox payment?",
    description:
      "Without an agent, Adaptive Gym does not generate a personalized routine. This published staff walkthrough will be grounded in your approved Passport context and verified inventory, then saved to Passport exactly as shown.",
    fields: [
      {
        label: "Proposed routine",
        value: `${template.name} · ${template.durationMinutes} minutes · ${template.stations.length} equipment blocks · staff walkthrough v${template.version}`,
      },
      { label: "Confirmed goal", value: goal.trim() },
      { label: "Approved Passport context used", value: contextSummaryFor(projection) },
      ...template.stations.map((station, index) => {
        const item = equipment.find((candidate) => candidate.id === station.equipmentId);
        return {
          label: `Exercise ${index + 1}`,
          value: `${item?.name ?? station.equipmentId} (${station.equipmentId}) · ${station.minutes} minutes · ${station.intensity}. ${station.instructions[0] ?? ""}`,
        };
      }),
      {
        label: "Generation",
        value:
          "Published staff walkthrough chosen by you; not agent-generated and not AI-personalized",
      },
      { label: "Product", value: offer.displayName },
      { label: "Amount", value: offer.entitled ? "Already unlocked" : "$4.99 test USD" },
      { label: "Payer", value: payerLabelFor(offer, paymentMode) },
      { label: "Payment network", value: paymentNetworkFor(offer, paymentMode) },
      { label: "Destination", value: "Save this exact walkthrough to Passport" },
      {
        label: "Data access",
        value: "Unchanged; only the active consented Gym projection is used",
      },
    ],
    confirmLabel: offer.entitled
      ? "Save this walkthrough"
      : paymentMode === "agent_wallet"
        ? "Approve walkthrough and agent payment"
        : "Approve walkthrough and open test checkout",
  };
}

export function prepareRoutineProConfirmation({
  offer,
  requestedInput,
  projection,
  equipment,
  existingOrder,
}: {
  offer: RoutineProOffer;
  requestedInput: CreatePersonalizedRoutineInput;
  projection: GymContextProjection;
  equipment: readonly Equipment[];
  /** A payable order with no submitted payment that will be resumed, never duplicated. */
  existingOrder?: Readonly<{ orderRef: string; orderStatus: string }>;
}): PreparedRoutineProConfirmation {
  const effectiveInput: CreatePersonalizedRoutineInput = {
    ...requestedInput,
    goal: requestedInput.goal.trim(),
  };
  const payer = payerLabelFor(offer, effectiveInput.paymentMode);
  const contextSummary = contextSummaryFor(projection);

  return {
    effectiveInput,
    preparation: {
      confirmation: {
        title: offer.entitled
          ? "Save this exact agent-generated routine?"
          : "Approve this exact routine and sandbox payment?",
        description:
          "Review the complete proposal below. The user-selected agent generated this routine from the approved Passport projection and verified Gym inventory. Adaptive Gym will validate it, process the sandbox payment when required, and save this exact routine to Passport; it will not generate a different routine afterward.",
        fields: [
          {
            label: "Proposed routine",
            value: `${effectiveInput.routine.title} · ${effectiveInput.routine.durationMinutes} minutes · ${effectiveInput.routine.exercises.length} equipment blocks`,
          },
          { label: "Confirmed goal", value: effectiveInput.goal },
          { label: "Approved Passport context used", value: contextSummary },
          ...effectiveInput.routine.exercises.map((exercise, index) => {
            const item = equipment.find((candidate) => candidate.id === exercise.equipmentId);
            return {
              label: `Exercise ${index + 1}`,
              value: `${item?.name ?? exercise.equipmentId} (${exercise.equipmentId}) · ${exercise.durationMinutes} minutes · ${exercise.intensity}. ${exercise.instructions.join(" ")} Adaptation: ${exercise.adaptationReason}`,
            };
          }),
          // These arrays are shown complete: their schema maxima (6 x 180 and
          // 8 x 200 characters) fit within one 1,800-character field, so the
          // person authorizes exactly what will be charged for and saved.
          {
            label: "Warm-up",
            value: summarize(
              effectiveInput.routine.warmup ?? [],
              "Not separately specified",
              MAX_CONFIRMATION_FIELD_CHARS,
            ),
          },
          {
            label: "Cooldown",
            value: summarize(
              effectiveInput.routine.cooldown ?? [],
              "Not separately specified",
              MAX_CONFIRMATION_FIELD_CHARS,
            ),
          },
          {
            label: "Safety notes",
            value: summarize(
              effectiveInput.routine.safetyNotes,
              "None supplied",
              MAX_CONFIRMATION_FIELD_CHARS,
            ),
          },
          {
            label: "Professional review",
            value: effectiveInput.routine.requiresExpertReview
              ? `${EXPERT_REVIEW_WARNING} ${effectiveInput.routine.expertReviewReason ?? "The approved context contains an injury, rehabilitation, or clearance uncertainty."}`
              : "Not marked as required by the submitted context; this remains a non-clinical demonstration.",
          },
          { label: "Product", value: offer.displayName },
          {
            label: "Amount",
            value: offer.entitled ? "Already unlocked" : "$4.99 test USD",
          },
          { label: "Payer", value: payer },
          {
            label: "Payment network",
            value: paymentNetworkFor(offer, effectiveInput.paymentMode),
          },
          { label: "Destination", value: "Save this exact routine to Passport" },
          {
            label: "Data access",
            value: "Unchanged; only the active consented Gym projection is used",
          },
          ...(existingOrder
            ? [
                {
                  label: "Existing order",
                  value: `${existingOrder.orderRef} (${existingOrder.orderStatus}) is resumed for this exact routine; no second charge is created.`,
                },
              ]
            : []),
        ],
        riskClass: offer.entitled ? "account-write" : "payment",
        confirmLabel: offer.entitled
          ? "Save this exact routine"
          : effectiveInput.paymentMode === "agent_wallet"
            ? "Approve exact routine and agent payment"
            : "Approve exact routine and open test checkout",
        cancelLabel: "Cancel",
      },
      quoteDigest: offer.quoteDigest,
    },
  };
}

export function webMcpMutationBusyLabel(request: MutationConfirmationRequest): string {
  if (request.toolName !== "create_personalized_routine") {
    return "Saving confirmed changes…";
  }
  const payer = request.fields.find((field) => field.label === "Payer")?.value;
  if (payer === "Adaptive World demo agent wallet") {
    return "Validating the exact routine and confirming the Tempo testnet payment…";
  }
  if (payer === "Human Stripe test checkout") {
    return "Validating the exact routine and opening Stripe test checkout…";
  }
  return "Validating and saving the exact agent-generated routine to Passport…";
}

export function prepareFeedbackConfirmation(
  input: RecordSessionFeedbackInput,
  completedExerciseIds: readonly string[],
): WebMCPMutationPreparation {
  return {
    confirmation: {
      title: "Record session feedback",
      description: "Review the exact feedback that will be saved to this Gym session.",
      fields: [
        { label: "Public routine reference", value: input.sessionId },
        { label: "Perceived exertion", value: String(input.perceivedExertion ?? 5) },
        { label: "Pain", value: String(input.pain ?? 0) },
        {
          label: "Completed station IDs",
          value: completedExerciseIds.length ? completedExerciseIds.join(", ") : "None",
        },
        { label: "Notes", value: input.notes ?? "None" },
      ],
      riskClass: "account-write",
      confirmLabel: "Save exact feedback",
      cancelLabel: "Cancel",
    },
  };
}
