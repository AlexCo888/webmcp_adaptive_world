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
  });

  it("publishes the exact 6 doctor tools without cross-origin exposure options", () => {
    const names = [
      "search_my_patients",
      "get_patient_overview",
      "get_patient_section",
      "get_patient_changes",
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

  it("publishes the exact 6 Gym tools", () => {
    const names = [
      "get_gym_profile",
      "search_equipment",
      "get_equipment",
      "get_active_context",
      "create_session_draft",
      "record_session_feedback",
    ];
    const tools = createGymToolCatalog(
      Object.fromEntries(names.map((name) => [name, handler])) as unknown as GymToolHandlers,
    );
    expect(tools.map(({ name }) => name)).toEqual(names);
    expect(
      tools.filter(({ annotations }) => !annotations.readOnlyHint).map(({ name }) => name),
    ).toEqual(["create_session_draft", "record_session_feedback"]);
  });
});
