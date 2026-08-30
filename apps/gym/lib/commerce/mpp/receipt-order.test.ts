import { describe, expect, it } from "vitest";

import { receiptMatchesOrderReference } from "./receipt-order";

describe("MPP receipt order binding", () => {
  it("accepts an omitted optional externalId and an exact echo", () => {
    expect(receiptMatchesOrderReference(undefined, "awrp_expected")).toBe(true);
    expect(receiptMatchesOrderReference("awrp_expected", "awrp_expected")).toBe(true);
  });

  it("rejects a conflicting externalId when the provider supplies one", () => {
    expect(receiptMatchesOrderReference("awrp_other", "awrp_expected")).toBe(false);
  });
});
