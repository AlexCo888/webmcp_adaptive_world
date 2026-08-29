import { describe, expect, it } from "vitest";
import {
  GYM_CONTEXT_READ_SCOPE,
  GYM_FEEDBACK_WRITE_SCOPE,
  hasRequiredGymScopes,
} from "./gym-scopes";

describe("Gym context grant scopes", () => {
  it("does not authorize feedback with the read scope alone", () => {
    expect(
      hasRequiredGymScopes(
        [GYM_CONTEXT_READ_SCOPE],
        [GYM_CONTEXT_READ_SCOPE, GYM_FEEDBACK_WRITE_SCOPE],
      ),
    ).toBe(false);
  });

  it("authorizes feedback only when both issued scopes are live", () => {
    expect(
      hasRequiredGymScopes(
        [GYM_CONTEXT_READ_SCOPE, GYM_FEEDBACK_WRITE_SCOPE],
        [GYM_CONTEXT_READ_SCOPE, GYM_FEEDBACK_WRITE_SCOPE],
      ),
    ).toBe(true);
  });
});
