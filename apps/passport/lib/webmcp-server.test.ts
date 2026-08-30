import { describe, expect, it } from "vitest";
import { testPassport } from "./test-passport-fixture";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/adaptive_world_test";
process.env.BETTER_AUTH_SECRET ??= "adaptive-world-test-secret-at-least-thirty-two-characters";

describe("Passport WebMCP closed request contract", () => {
  it("accepts only the known owner and clinician read tools", async () => {
    const { PassportWebMcpRequestSchema } = await import("./webmcp-server");
    expect(
      PassportWebMcpRequestSchema.parse({
        tool: "get_patient_section",
        input: { patientId: "passport_mateo", section: "labs" },
      }),
    ).toEqual({
      tool: "get_patient_section",
      input: { patientId: "passport_mateo", section: "labs" },
    });
    const retiredTool = ["get", "patient", "changes"].join("_");
    expect(PassportWebMcpRequestSchema.safeParse({ tool: retiredTool, input: {} }).success).toBe(
      false,
    );
  });

  it("rejects actor fields and unknown nested properties", async () => {
    const { PassportWebMcpRequestSchema } = await import("./webmcp-server");
    expect(
      PassportWebMcpRequestSchema.safeParse({
        tool: "get_patient_overview",
        input: { patientId: "passport_mateo", actorId: "doctor_other" },
      }).success,
    ).toBe(false);
    expect(
      PassportWebMcpRequestSchema.safeParse({
        tool: "get_my_passport_summary",
        input: {},
        ownerId: "owner_other",
      }).success,
    ).toBe(false);
  });

  it("applies bounded search defaults", async () => {
    const { PassportWebMcpRequestSchema } = await import("./webmcp-server");
    expect(PassportWebMcpRequestSchema.parse({ tool: "search_my_patients", input: {} })).toEqual({
      tool: "search_my_patients",
      input: { query: "", limit: 10 },
    });
    expect(
      PassportWebMcpRequestSchema.safeParse({
        tool: "search_my_patients",
        input: { limit: 21 },
      }).success,
    ).toBe(false);
  });

  it("requires and normalizes the exact natural-language goal for a Gym grant", async () => {
    const { PassportWebMcpRequestSchema } = await import("./webmcp-server");
    const input = {
      recipient: "adaptive-gym",
      scopes: ["gym.context.read", "gym.feedback.write"],
      goal: "  Support lifelong health without bodybuilding-style muscle gain  ",
      expiresInMinutes: 5,
    };
    expect(
      PassportWebMcpRequestSchema.parse({ tool: "prepare_context_grant", input }),
    ).toMatchObject({
      input: { goal: "Support lifelong health without bodybuilding-style muscle gain" },
    });
    const { goal: _goal, ...withoutGoal } = input;
    void _goal;
    expect(
      PassportWebMcpRequestSchema.safeParse({
        tool: "prepare_context_grant",
        input: withoutGoal,
      }).success,
    ).toBe(false);
  });

  it("keeps the doctor summary free of clinical measurements", async () => {
    const { doctorPassportSummary } = await import("./webmcp-server");
    const summary = doctorPassportSummary(testPassport, new Date("2026-08-29T09:00:00.000Z"));
    expect(summary.profile.displayName).toBe(testPassport.identity.displayName);
    expect(summary.profile.age).toBeTypeOf("number");
    expect(summary).not.toHaveProperty("health");
    expect(summary.profile).not.toHaveProperty("heightCm");
    const notableLabel = testPassport.notableResults.at(0)?.label;
    if (!notableLabel) throw new Error("The test fixture requires a notable result.");
    expect(JSON.stringify(summary)).not.toContain(notableLabel);
  });
});
