import { equipmentCatalog } from "@adaptive-world/demo-data";
import { describe, expect, it } from "vitest";
import { matchesEquipmentSearch } from "./equipment-search";

describe("shared equipment search", () => {
  it("returns the same manufacturer matches used by the API, WebMCP result, and catalog UI", () => {
    const matches = equipmentCatalog.filter((item) =>
      matchesEquipmentSearch(item, { query: "Life Fitness", availableOnly: true }),
    );

    expect(matches).toHaveLength(9);
    expect(matches.every((item) => item.manufacturer === "Life Fitness")).toBe(true);
  });

  it("matches the canonical low-impact accessible-equipment phrase semantically", () => {
    const matches = equipmentCatalog.filter((item) =>
      matchesEquipmentSearch(item, {
        query: "low impact accessible equipment",
        availableOnly: true,
      }),
    );

    expect(matches).toHaveLength(2);
    expect(matches.every((item) => item.accessibility.length > 0)).toBe(true);
    expect(matches.every((item) => item.suitabilityTags.includes("low-impact"))).toBe(true);
  });

  it("does not weaken an unavailable anti-gravity treadmill request into a treadmill match", () => {
    const matches = equipmentCatalog.filter((item) =>
      matchesEquipmentSearch(item, { query: "anti-gravity treadmill", availableOnly: true }),
    );

    expect(matches).toHaveLength(0);
  });
});
