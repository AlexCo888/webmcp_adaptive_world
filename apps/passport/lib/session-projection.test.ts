import { describe, expect, it } from "vitest";
import { projectDoctorPassport } from "./session";
import { testPassport } from "./test-passport-fixture";

const passport = testPassport;
const now = new Date("2026-08-29T09:00:00.000Z");

describe("clinician bootstrap scope projection", () => {
  it("keeps summary-only bootstrap free of exact identity and clinical arrays", () => {
    const projected = projectDoctorPassport(passport, new Set(["passport.summary.read"]), now);
    expect(projected.displayName).toBe(passport.identity.displayName);
    expect(projected.ageYears).toBeTypeOf("number");
    expect(projected.clinical).toBeNull();
    expect(projected.documents).toEqual([]);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain(passport.identity.dateOfBirth);
    expect(serialized).not.toContain('"medications"');
    expect(serialized).not.toContain('"notableResults"');
    expect(serialized).not.toContain('"sources"');
  });

  it("adds only redacted clinical fields and low-detail document indexes for exact scopes", () => {
    const projected = projectDoctorPassport(
      passport,
      new Set(["passport.summary.read", "passport.clinical.read", "passport.documents.read"]),
      now,
    );
    expect(projected.clinical?.conditions.length).toBeGreaterThan(0);
    expect(projected.documents.length).toBeGreaterThan(0);
    expect(projected.clinical?.conditions[0]).not.toHaveProperty("notes");
    expect(projected.clinical?.vitalSigns[0]).not.toHaveProperty("referenceRange");
    expect(projected.documents[0]).not.toHaveProperty("sensitivity");
  });
});
