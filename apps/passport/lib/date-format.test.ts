import { describe, expect, it } from "vitest";

import { formatPassportDate, formatPassportDateTime } from "./date-format";

describe("Passport date formatting", () => {
  it("is deterministic across server and browser time zones", () => {
    const value = "2026-08-30T18:46:15.235Z";

    expect(formatPassportDate(value)).toBe("Aug 30, 2026");
    expect(formatPassportDateTime(value)).toBe("Aug 30, 6:46 PM UTC");
  });
});
