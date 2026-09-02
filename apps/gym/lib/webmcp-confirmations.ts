import type { Equipment, GymContextProjection, RoutineProOffer } from "@adaptive-world/contracts";
import type {
  CreatePersonalizedRoutineInput,
  MutationConfirmationRequest,
  RecordSessionFeedbackInput,
  WebMCPMutationPreparation,
} from "@adaptive-world/webmcp";
import { EXPERT_REVIEW_WARNING } from "./session-planner";

export type PreparedRoutineProConfirmation = Readonly<{
  effectiveInput: CreatePersonalizedRoutineInput;
  preparation: WebMCPMutationPreparation;
}>;

function summarize(values: readonly string[], fallback: string, max = 520): string {
  const value = values.length ? values.join("; ") : fallback;
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function prepareRoutineProConfirmation({
  offer,
  requestedInput,
  projection,
  equipment,
}: {
  offer: RoutineProOffer;
  requestedInput: CreatePersonalizedRoutineInput;
  projection: GymContextProjection;
  equipment: readonly Equipment[];
}): PreparedRoutineProConfirmation {
  const effectiveInput: CreatePersonalizedRoutineInput = {
    ...requestedInput,
    goal: requestedInput.goal.trim(),
  };
  const payer = offer.entitled
    ? "Existing Passport entitlement"
    : effectiveInput.paymentMode === "agent_wallet"
      ? "Adaptive World demo agent wallet"
      : "Human Stripe test checkout";
  const contextSummary = [
    `Projection ${projection.projectionId}`,
    `Goals: ${summarize(projection.goals, "None")}`,
    `Movement considerations: ${summarize(projection.movementConsiderations, "None")}`,
    `Avoid: ${summarize(projection.avoid, "None")}`,
    `Stop signals: ${summarize(projection.stopSignals, "None")}`,
  ].join(" · ");

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
          {
            label: "Warm-up",
            value: summarize(effectiveInput.routine.warmup ?? [], "Not separately specified"),
          },
          {
            label: "Cooldown",
            value: summarize(effectiveInput.routine.cooldown ?? [], "Not separately specified"),
          },
          {
            label: "Safety notes",
            value: summarize(effectiveInput.routine.safetyNotes, "None supplied"),
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
            value:
              effectiveInput.paymentMode === "agent_wallet"
                ? "MPP / Tempo testnet — sandbox transaction"
                : offer.entitled
                  ? "No new payment"
                  : "Stripe test mode — sandbox transaction",
          },
          { label: "Destination", value: "Save this exact routine to Passport" },
          {
            label: "Data access",
            value: "Unchanged; only the active consented Gym projection is used",
          },
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
