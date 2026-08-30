import { DigitalPassportSchema } from "@adaptive-world/contracts";
import { describe, expect, it } from "vitest";
import { parsePersistedDigitalPassport } from "./persisted-passport";
import { testPassport } from "./test-passport-fixture";

describe("persisted Passport compatibility", () => {
  it("classifies a legacy synthetic functional profile as self-reported", () => {
    const { sourceCategory, ...legacyFunctional } = testPassport.functional;
    expect(sourceCategory).toBe("clinician_guidance");
    const legacyProfile = { ...testPassport, functional: legacyFunctional };

    expect(DigitalPassportSchema.safeParse(legacyProfile).success).toBe(false);
    expect(parsePersistedDigitalPassport(legacyProfile).functional.sourceCategory).toBe(
      "self_reported",
    );
  });

  it("preserves valid provenance and rejects an explicit unknown value", () => {
    expect(parsePersistedDigitalPassport(testPassport).functional.sourceCategory).toBe(
      "clinician_guidance",
    );
    expect(() =>
      parsePersistedDigitalPassport({
        ...testPassport,
        functional: { ...testPassport.functional, sourceCategory: "legacy" },
      }),
    ).toThrow();
  });
});
