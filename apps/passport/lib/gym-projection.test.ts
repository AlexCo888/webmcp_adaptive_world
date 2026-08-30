import { describe, expect, it } from "vitest";
import {
  GYM_CONTEXT_SCOPES,
  gymProjectionInput,
  preferredMinutesFromProjection,
} from "./gym-projection";
import { testPassport } from "./test-passport-fixture";

describe("Gym projection disclosure", () => {
  const requestedRoutineGoal = "Support lifelong health without bodybuilding-style muscle gain";

  it("builds the complete allowlist shown before sharing", () => {
    const projection = gymProjectionInput(testPassport, requestedRoutineGoal);
    expect(GYM_CONTEXT_SCOPES).toEqual(["gym.context.read", "gym.feedback.write"]);
    expect(projection).toEqual({
      requestedRoutineGoal,
      goals: ["Build strength"],
      experienceLevel: "beginner",
      preferredActivities: ["Cycling"],
      preferredSessionMinutes: { min: 20, max: 40 },
      functionalCapabilities: ["120 weekly activity minutes reported"],
      movementConsiderations: ["Use a gradual warm-up"],
      avoid: [],
      stopSignals: ["Stop for dizziness"],
      accessibilityNeeds: ["Clear routes"],
      sourceCategories: ["clinician_guidance"],
    });
    expect(preferredMinutesFromProjection(projection)).toBe(30);
  });

  it("does not project clinical, identity, document, or payment fields", () => {
    const serialized = JSON.stringify(gymProjectionInput(testPassport, requestedRoutineGoal));
    expect(serialized).not.toContain(testPassport.identity.displayName);
    expect(serialized).not.toContain(testPassport.identity.dateOfBirth);
    expect(serialized).not.toContain(testPassport.medications[0]?.name ?? "Test medication");
    expect(serialized).not.toContain(testPassport.documents[0]?.title ?? "Test clinical source");
  });
});
