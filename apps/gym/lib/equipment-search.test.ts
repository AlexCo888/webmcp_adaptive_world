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

    expect(matches.map((item) => item.id)).toEqual([
      "lf_integrity_plus_elliptical",
      "lf_integrity_recumbent",
      "balanced_body_allegro_2",
      "nustep_t6max",
      "scifit_stepone",
    ]);
    expect(matches.every((item) => item.accessibility.length > 0)).toBe(true);
    expect(matches.every((item) => item.suitabilityTags.includes("low-impact"))).toBe(true);
  });

  it("maps the rower equipment noun only to the rowing ergometer", () => {
    const matches = equipmentCatalog.filter((item) =>
      matchesEquipmentSearch(item, { query: "rower", availableOnly: true }),
    );

    expect(matches.map((item) => item.id)).toEqual(["lf_heat_row"]);
  });

  it("does not weaken an unavailable anti-gravity treadmill request into a treadmill match", () => {
    const matches = equipmentCatalog.filter((item) =>
      matchesEquipmentSearch(item, { query: "anti-gravity treadmill", availableOnly: true }),
    );

    expect(matches).toHaveLength(0);
  });

  it("uses documented operating dimensions for constrained-space searches", () => {
    const f9 = equipmentCatalog.find((item) => item.id === "torque_f9_functional_trainer");

    if (!f9) throw new Error("Expected the F9 fixture in the equipment catalog");
    expect(
      matchesEquipmentSearch(f9, {
        query: "functional trainer",
        maxWidthCm: 200,
        maxDepthCm: 220,
      }),
    ).toBe(false);
    expect(
      matchesEquipmentSearch(f9, {
        query: "functional trainer",
        maxWidthCm: 244,
        maxDepthCm: 274,
      }),
    ).toBe(true);
  });

  it("returns cable trainers, not the push sled, for functional-trainer searches", () => {
    const matches = equipmentCatalog.filter((item) =>
      matchesEquipmentSearch(item, {
        query: "functional trainers",
        maxWidthCm: 200,
        maxDepthCm: 220,
      }),
    );

    expect(matches.map((item) => item.id)).toEqual(["lf_dual_adjustable_pulley"]);
  });

  it("uses the push sled's travel lane instead of its stationary footprint", () => {
    const tank = equipmentCatalog.find((item) => item.id === "torque_tank_m1");

    if (!tank) throw new Error("Expected the TANK M1 fixture in the equipment catalog");
    expect(
      matchesEquipmentSearch(tank, {
        query: "push sled",
        maxWidthCm: 100,
        maxDepthCm: 120,
      }),
    ).toBe(false);
    expect(
      matchesEquipmentSearch(tank, {
        query: "push sled",
        maxWidthCm: 100,
        maxDepthCm: 298,
      }),
    ).toBe(true);
  });
});
