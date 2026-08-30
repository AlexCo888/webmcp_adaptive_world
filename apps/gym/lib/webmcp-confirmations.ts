import type { RoutineProOffer } from "@adaptive-world/contracts";
import type {
  CreatePersonalizedRoutineInput,
  MutationConfirmationRequest,
  RecordSessionFeedbackInput,
  WebMCPMutationPreparation,
} from "@adaptive-world/webmcp";
import { pendingPaymentMode, type PendingRoutineProOrder } from "./routine-pro-client-state";

export type PreparedRoutineProConfirmation = Readonly<{
  effectiveInput: CreatePersonalizedRoutineInput & {
    templateId: NonNullable<CreatePersonalizedRoutineInput["templateId"]>;
  };
  preparation: WebMCPMutationPreparation;
}>;

export function routineTemplateConfirmationField(
  templateId: NonNullable<CreatePersonalizedRoutineInput["templateId"]>,
) {
  return { label: "Template ID", value: templateId } as const;
}

export function prepareRoutineProConfirmation({
  offer,
  requestedInput,
  recommendedTemplateId,
  pending,
}: {
  offer: RoutineProOffer;
  requestedInput: CreatePersonalizedRoutineInput;
  recommendedTemplateId: NonNullable<CreatePersonalizedRoutineInput["templateId"]>;
  pending: PendingRoutineProOrder | null;
}): PreparedRoutineProConfirmation {
  const effectiveInput = pending
    ? {
        templateId: pending.initialTemplateId,
        goal: pending.initialGoal ?? requestedInput.goal.trim(),
        paymentMode: pendingPaymentMode(pending),
      }
    : {
        ...requestedInput,
        goal: requestedInput.goal.trim(),
        templateId: requestedInput.templateId ?? recommendedTemplateId,
      };
  const payer = offer.entitled
    ? "Existing Passport entitlement"
    : (pending?.payerLabel ??
      (effectiveInput.paymentMode === "agent_wallet"
        ? "Adaptive World demo agent"
        : "Human test checkout"));

  return {
    effectiveInput,
    preparation: {
      confirmation: {
        title: pending
          ? "Resume the existing sandbox payment?"
          : offer.entitled
            ? "Create and save your personalized routine"
            : "Approve Routine Pro sandbox payment?",
        description: pending
          ? "Resume the existing Routine Pro sandbox payment. Its payer, goal, and staff template are locked, so no second payment rail will be opened. Free Gym access remains unchanged."
          : "Passport connection, context review, Gym profile, and equipment discovery are free. This confirmation is only for the Routine Pro action that creates and saves a personalized routine; it does not expand Passport access.",
        fields: [
          {
            label: "Free tier",
            value: "Passport connection, context review, Gym profile, and equipment discovery",
          },
          { label: "Paid tier", value: "Routine creation and Passport saving" },
          { label: "Product", value: offer.displayName },
          { label: "Your goal", value: effectiveInput.goal },
          routineTemplateConfirmationField(effectiveInput.templateId),
          { label: "Includes", value: "Personalized routine creation and Passport saving" },
          { label: "Payer", value: payer },
          {
            label: "Amount",
            value: offer.entitled ? "Already unlocked" : "$4.99 test USD",
          },
          { label: "Mode", value: "Sandbox — no real funds" },
          { label: "Data access", value: "Unchanged; no additional health fields" },
        ],
        riskClass: offer.entitled ? "account-write" : "payment",
        confirmLabel: pending
          ? "Resume"
          : offer.entitled
            ? "Create and save"
            : effectiveInput.paymentMode === "agent_wallet"
              ? "Approve agent payment"
              : "Continue to secure test checkout",
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
  if (payer === "Adaptive World demo agent") {
    return "Paying with the Adaptive World demo agent…";
  }
  if (payer === "Human test checkout") {
    return "Opening secure Stripe test checkout…";
  }
  return "Saving your staff-authored routine to Passport…";
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
