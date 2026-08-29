import { describe, expect, it } from "vitest";
import type { PortalActor } from "./session";
import {
  DEMO_RESET_OPERATOR_ID,
  DEMO_RESET_OPERATOR_SUBJECT,
  isDemoResetOperator,
} from "./demo-reset-authorization";

const clinician: PortalActor = {
  id: DEMO_RESET_OPERATOR_ID,
  authSubject: DEMO_RESET_OPERATOR_SUBJECT,
  email: "elena.vargas@adaptiveworld.test",
  displayName: "Dr. Elena Vargas",
  role: "doctor",
};

describe("synthetic demo reset authorization", () => {
  it("allows only the exact clinician demo operator", () => {
    expect(isDemoResetOperator(clinician)).toBe(true);
  });

  it("denies the owner even if the owner is a known synthetic identity", () => {
    expect(
      isDemoResetOperator({
        ...clinician,
        id: "00000000-0000-4000-8000-000000000001",
        authSubject: "auth_mateo_demo",
        role: "owner",
      }),
    ).toBe(false);
  });
});
