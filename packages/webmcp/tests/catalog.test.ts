import { describe, expect, it, vi } from "vitest";

import {
  createDoctorToolCatalog,
  createGymToolCatalog,
  createPassportToolCatalog,
  type DoctorToolHandlers,
  type GymToolHandlers,
  type PassportToolHandlers,
} from "../src";

const handler = vi.fn(() => ({ ok: true }));

describe("Adaptive World tool catalogs", () => {
  it("publishes the exact 4 Passport tools", () => {
    const tools = createPassportToolCatalog(
      Object.fromEntries(
        [
          "get_my_passport_summary",
          "list_my_shares",
          "create_context_grant",
          "revoke_access_grant",
        ].map((name) => [name, handler]),
      ) as unknown as PassportToolHandlers,
    );
    expect(tools.map(({ name }) => name)).toEqual([
      "get_my_passport_summary",
      "list_my_shares",
      "create_context_grant",
      "revoke_access_grant",
    ]);
    expect(tools.filter(({ annotations }) => !annotations.readOnlyHint)).toHaveLength(2);
    expect(tools.find(({ name }) => name === "create_context_grant")?.inputSchema).toMatchObject({
      required: ["recipient", "scopes", "goal"],
      properties: {
        goal: { minLength: 2, maxLength: 160 },
        expiresInMinutes: { minimum: 1, maximum: 20, default: 20 },
      },
    });
  });

  it("publishes the exact 5 truthful doctor tools without simulated change data", () => {
    const names = [
      "search_my_patients",
      "get_patient_overview",
      "get_patient_section",
      "open_patient_source",
      "add_clinical_guidance",
    ];
    const tools = createDoctorToolCatalog(
      Object.fromEntries(names.map((name) => [name, handler])) as unknown as DoctorToolHandlers,
    );
    expect(tools.map(({ name }) => name)).toEqual(names);
    expect(
      tools.find(({ name }) => name === "add_clinical_guidance")?.annotations.readOnlyHint,
    ).toBe(false);
  });

  it("publishes the free Gym surface, read-only recovery, and one prepared Pro mutation", () => {
    const names = [
      "get_gym_profile",
      "search_equipment",
      "get_equipment",
      "get_active_context",
      "get_routine_pro_offer",
      "get_routine_pro_status",
      "create_personalized_routine",
      "record_session_feedback",
    ];
    const prepare = vi.fn(() => ({
      confirmation: {
        title: "Validate and save the exact agent-generated routine",
        description: "Review the complete exact proposal.",
        fields: [{ label: "Product", value: "Adaptive Routine Pro" }],
        riskClass: "payment" as const,
      },
      quoteDigest: "quote_digest",
    }));
    const tools = createGymToolCatalog({
      get_gym_profile: handler,
      search_equipment: handler,
      get_equipment: handler,
      get_active_context: handler,
      get_routine_pro_offer: handler,
      get_routine_pro_status: handler,
      create_personalized_routine: { prepare, execute: handler },
      record_session_feedback: { prepare, execute: handler },
    } satisfies GymToolHandlers);
    expect(tools.map(({ name }) => name)).toEqual(names);
    expect(
      tools.filter(({ annotations }) => !annotations.readOnlyHint).map(({ name }) => name),
    ).toEqual(["create_personalized_routine", "record_session_feedback"]);
    expect(tools.find(({ name }) => name === "get_routine_pro_offer")?.description).toContain(
      "agent-generated routine",
    );
    expect(tools.find(({ name }) => name === "get_routine_pro_status")).toMatchObject({
      annotations: { readOnlyHint: true },
    });
    const createRoutine = tools.find(({ name }) => name === "create_personalized_routine");
    expect(createRoutine?.prepareMutation).toBe(prepare);
    expect(createRoutine?.inputSchema).toMatchObject({ required: ["goal", "routine"] });
    expect(createRoutine?.inputSchema.required).not.toContain("templateId");
    expect(tools.find(({ name }) => name === "record_session_feedback")?.prepareMutation).toBe(
      prepare,
    );
  });
});
