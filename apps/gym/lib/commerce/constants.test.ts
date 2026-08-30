import { describe, expect, it } from "vitest";

import { canResumeRoutineProOrderStatus } from "./constants";

describe("Routine Pro resumability", () => {
  it("resumes pre-submission setup and verified local fulfillment only", () => {
    expect(canResumeRoutineProOrderStatus("created")).toBe(true);
    expect(canResumeRoutineProOrderStatus("provider_pending")).toBe(true);
    expect(canResumeRoutineProOrderStatus("paid_unfulfilled")).toBe(true);
  });

  it("keeps submitted and ambiguous payments locked", () => {
    expect(canResumeRoutineProOrderStatus("payment_submitted")).toBe(false);
    expect(canResumeRoutineProOrderStatus("reconciliation_required")).toBe(false);
  });
});
