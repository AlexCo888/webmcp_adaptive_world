import { GymContextProjectionSchema, RoutineGoalSchema } from "@adaptive-world/contracts";
import type { WebMCPMutationConfirmationField } from "@adaptive-world/webmcp";
import { z } from "zod";
import { GYM_CONTEXT_SCOPES } from "./gym-projection";

export const GYM_PROJECTION_REFERENCE = "Assigned after one-use redemption" as const;

export const ContextGrantToolInputSchema = z
  .object({
    recipient: z.literal("adaptive-gym"),
    scopes: z
      .array(z.enum(["gym.context.read", "gym.feedback.write"]))
      .length(2)
      .refine((scopes) => GYM_CONTEXT_SCOPES.every((scope) => scopes.includes(scope))),
    goal: RoutineGoalSchema,
    expiresInMinutes: z.number().int().min(1).max(15).default(5),
  })
  .strict();

export const GymContextGrantDisclosureSchema = GymContextProjectionSchema.omit({
  projectionId: true,
})
  .extend({
    requestedRoutineGoal: RoutineGoalSchema,
    projectionReference: z.literal(GYM_PROJECTION_REFERENCE),
  })
  .strict();

export const PreparedGymContextGrantResponseSchema = z
  .object({
    audience: z.literal("adaptive-gym"),
    scopes: z.tuple([z.literal("gym.context.read"), z.literal("gym.feedback.write")]),
    purpose: z.string().min(1).max(240),
    projection: GymContextGrantDisclosureSchema,
    preparationToken: z.string().min(80).max(2_048),
    quoteDigest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export type ContextGrantToolInput = z.infer<typeof ContextGrantToolInputSchema>;
export type PreparedGymContextGrant = z.infer<typeof PreparedGymContextGrantResponseSchema>;

function listed(values: readonly string[]): string {
  return values.length ? values.join("; ") : "None";
}

export function contextGrantConfirmationFields(
  prepared: PreparedGymContextGrant,
): readonly WebMCPMutationConfirmationField[] {
  const projection = prepared.projection;
  return [
    { label: "Recipient", value: "Adaptive Gym" },
    { label: "Scopes", value: prepared.scopes.join(", ") },
    {
      label: "This step",
      value:
        "Free connection; routine generation and Passport saving require a separate, explicitly confirmed paid action in Gym",
    },
    { label: "Grant purpose", value: prepared.purpose },
    { label: "Projection purpose", value: projection.purpose },
    { label: "Subject alias", value: projection.subjectAlias },
    { label: "Anonymous projection reference", value: projection.projectionReference },
    { label: "Requested routine goal", value: projection.requestedRoutineGoal },
    { label: "Passport goals", value: listed(projection.goals) },
    { label: "Experience", value: projection.experienceLevel },
    { label: "Preferred session", value: `${projection.preferredSessionMinutes} minutes` },
    { label: "Preferred activities", value: listed(projection.preferredActivities) },
    { label: "Functional capabilities", value: listed(projection.functionalCapabilities) },
    { label: "Movement considerations", value: listed(projection.movementConsiderations) },
    { label: "Avoid", value: listed(projection.avoid) },
    { label: "Stop signals", value: listed(projection.stopSignals) },
    { label: "Accessibility needs", value: listed(projection.accessibilityNeeds) },
    { label: "Provenance classes", value: listed(projection.sourceCategories) },
    { label: "Issued at", value: projection.issuedAt },
    { label: "Expires at", value: projection.expiresAt },
    { label: "Synthetic", value: "Yes" },
    {
      label: "Not shared",
      value:
        "Name, exact birth date, contacts, diagnoses, medications, labs, allergies, documents, Passport ID, clinician identity, and payment data",
    },
  ];
}
