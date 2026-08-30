import { describe, expect, it } from "vitest";

import { CommerceError } from "./http";
import { MppAdapterError } from "./mpp";
import {
  isAgentPaymentConfigurationError,
  safeAgentPaymentFailureCause,
} from "./agent-pay-diagnostics";

describe("agent-payment diagnostics", () => {
  it("keeps known commerce and provider failures closed", () => {
    expect(safeAgentPaymentFailureCause(new CommerceError("BUDGET_EXCEEDED"))).toBe(
      "commerce:BUDGET_EXCEEDED",
    );
    expect(safeAgentPaymentFailureCause(new MppAdapterError("PAYMENT_FAILED"))).toBe(
      "mpp:PAYMENT_FAILED",
    );
  });

  it("identifies configuration classes without logging values", () => {
    const tooShort = new TypeError("Routine Pro capability secrets must contain at least 32 bytes");
    const missing = new Error("MPP_TEMPO_CURRENCY is required while its provider is enabled");

    expect(isAgentPaymentConfigurationError(tooShort)).toBe(true);
    expect(isAgentPaymentConfigurationError(missing)).toBe(true);
    expect(safeAgentPaymentFailureCause(tooShort)).toBe(
      "configuration:COMMERCE_CAPABILITY_SECRET_TOO_SHORT",
    );
    expect(safeAgentPaymentFailureCause(missing)).toBe("configuration:MPP_TEMPO_CURRENCY_MISSING");
  });

  it("emits only SQLSTATE and a safe constraint name for database errors", () => {
    const error = {
      code: "23514",
      constraint: "payment_provider_setups_request_fingerprint_check",
      params: ["must-not-appear"],
      query: "must-not-appear",
    };

    const diagnostic = safeAgentPaymentFailureCause(error);
    expect(diagnostic).toBe("database:23514:payment_provider_setups_request_fingerprint_check");
    expect(diagnostic).not.toContain("must-not-appear");
  });
});
