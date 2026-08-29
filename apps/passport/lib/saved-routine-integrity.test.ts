import { canonicalizeJson, sha256Hex } from "@adaptive-world/security";
import { describe, expect, it } from "vitest";
import { verifySavedRoutinePlanHash } from "./saved-routine-integrity";

describe("saved routine integrity", () => {
  it("accepts the canonical plan snapshot", async () => {
    const plan = { title: "Routine", exercises: [{ id: "station-1", minutes: 8 }] };
    const hash = await sha256Hex(canonicalizeJson(plan));
    await expect(verifySavedRoutinePlanHash(plan, hash)).resolves.toBe(true);
  });

  it("rejects valid-shaped content changed after hashing", async () => {
    const original = { title: "Routine", durationMinutes: 20 };
    const hash = await sha256Hex(canonicalizeJson(original));
    await expect(
      verifySavedRoutinePlanHash({ ...original, durationMinutes: 30 }, hash),
    ).resolves.toBe(false);
  });
});
