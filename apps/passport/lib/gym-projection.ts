import type { DigitalPassport } from "@adaptive-world/contracts";
import type { GymProjectionInput } from "@adaptive-world/security";

export const GYM_CONTEXT_SCOPES = ["gym.context.read", "gym.feedback.write"] as const;

export const GYM_CONTEXT_PURPOSE =
  "Match a staff-authored Gym walkthrough to approved movement context";

/** The complete allowlisted profile used to construct a Gym context grant. */
export function gymProjectionInput(passport: DigitalPassport): GymProjectionInput {
  return {
    goals: passport.functional.goals,
    experienceLevel: passport.functional.experienceLevel,
    preferredActivities: passport.functional.preferredActivities,
    preferredSessionMinutes: {
      min: Math.max(15, passport.functional.preferredSessionMinutes - 10),
      max: passport.functional.preferredSessionMinutes + 10,
    },
    functionalCapabilities: [
      `${passport.functional.weeklyActivityMinutes} weekly activity minutes reported`,
    ],
    movementConsiderations: passport.functional.movementConsiderations,
    avoid: [],
    stopSignals: passport.functional.stopSignals,
    accessibilityNeeds: passport.functional.accessibilityNeeds,
    sourceCategories: [passport.functional.sourceCategory],
  };
}

export function preferredMinutesFromProjection(input: GymProjectionInput): number {
  const preferred = input.preferredSessionMinutes;
  return preferred ? Math.round((preferred.min + preferred.max) / 2) : 45;
}
