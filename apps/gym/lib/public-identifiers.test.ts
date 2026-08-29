import { describe, expect, it } from "vitest";
import { toPublicGymProjectionId, toPublicGymRoutineId } from "./public-identifiers";

describe("public Gym identifiers", () => {
  it("never exposes or reuses the internal session UUID", () => {
    const internal = "7f628908-b66f-4c77-a6d1-9db90dd1f0ef";
    const projection = toPublicGymProjectionId(internal);
    const routine = toPublicGymRoutineId(internal);

    expect(projection).toMatch(/^gym_projection_[0-9a-f]{24}$/u);
    expect(routine).toMatch(/^gym_routine_[0-9a-f]{24}$/u);
    expect(projection).not.toContain(internal);
    expect(routine).not.toContain(internal);
    expect(projection).not.toBe(routine);
  });
});
