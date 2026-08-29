import type { RoutineProOffer } from "@adaptive-world/contracts";
import type {
  CreatePersonalizedRoutineInput,
  MutationConfirmationRequest,
  RecordSessionFeedbackInput,
  WebMCPMutationPreparation,
} from "@adaptive-world/webmcp";
import { pendingPaymentMode, type PendingRoutineProOrder } from "./routine-pro-client-state";

export type PreparedRoutineProConfirmation = Readonly<{
  effectiveInput: CreatePersonalizedRoutineInput;
  preparation: WebMCPMutationPreparation;
}>;

export function routineTemplateConfirmationField(
  templateId: CreatePersonalizedRoutineInput["templateId"],
) {
  return { label: "Template ID", value: templateId } as const;
}

export function prepareRoutineProConfirmation({
  offer,
  requestedInput,
  pending,
}: {
  offer: RoutineProOffer;
  requestedInput: CreatePersonalizedRoutineInput;
  pending: PendingRoutineProOrder | null;
}): PreparedRoutineProConfirmation {
  const effectiveInput: CreatePersonalizedRoutineInput = pending
    ? {
        templateId: pending.initialTemplateId,
        paymentMode: pendingPaymentMode(pending),
      }
    : requestedInput;
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
          ? "Payment already in progress"
          : "Create and save your personalized routine",
        description: pending
          ? "Resume the existing Routine Pro payment. Its payer and staff template are locked, so no second payment rail will be opened."
          : "This uses the active minimum Gym context and a published staff template. It does not expand Passport access.",
        fields: [
          { label: "Product", value: offer.displayName },
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
