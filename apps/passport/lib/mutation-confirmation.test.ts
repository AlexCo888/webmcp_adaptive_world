import type { MutationConfirmationRequest } from "@adaptive-world/webmcp";
import { describe, expect, it, vi } from "vitest";
import { createMutationConfirmationGate } from "./mutation-confirmation";

function request(
  toolName: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
): MutationConfirmationRequest {
  return {
    toolName,
    title: `Confirm ${toolName}`,
    description: "Review the exact mutation.",
    fields: [],
    riskClass: "account-write",
    input,
    signal,
  };
}

describe("Passport mutation confirmation gate", () => {
  it("fails a concurrent mutation closed without replacing the visible approval", async () => {
    const present = vi.fn();
    const gate = createMutationConfirmationGate(present);
    const first = request("revoke_access_grant", { grantId: "grant-a" });
    const second = request("revoke_access_grant", { grantId: "grant-b" });

    const firstDecision = gate.confirm(first);
    expect(present).toHaveBeenLastCalledWith(first);
    expect(gate.confirm(second)).toBe(false);
    expect(present).toHaveBeenCalledTimes(1);

    gate.decide(true);
    await expect(Promise.resolve(firstDecision)).resolves.toBe(true);
    expect(present).toHaveBeenLastCalledWith(null);

    const secondDecision = gate.confirm(second);
    expect(present).toHaveBeenLastCalledWith(second);
    gate.decide(false);
    await expect(Promise.resolve(secondDecision)).resolves.toBe(false);
  });

  it("declines and cleans up an aborted or unmounted confirmation", async () => {
    const present = vi.fn();
    const gate = createMutationConfirmationGate(present);
    const controller = new AbortController();
    const aborted = gate.confirm(request("add_clinical_guidance", {}, controller.signal));

    controller.abort();
    await expect(Promise.resolve(aborted)).resolves.toBe(false);
    expect(present).toHaveBeenLastCalledWith(null);

    const unmounted = gate.confirm(request("create_context_grant", {}));
    gate.dispose();
    await expect(Promise.resolve(unmounted)).resolves.toBe(false);
  });
});
