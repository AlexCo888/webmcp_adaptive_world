import { equipmentCatalog } from "@adaptive-world/demo-data";
import { describe, expect, it } from "vitest";
import {
  compactEquipmentForTool,
  createEquipmentSearchToolResult,
  getEquipmentOperatingDimensions,
  matchesEquipmentSearch,
} from "./equipment-search";

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

    const toolResult = createEquipmentSearchToolResult(matches);
    expect(toolResult).toMatchObject({ count: 5, returned: 2, truncated: true });
    expect(JSON.stringify({ ok: true, data: toolResult }).length).toBeLessThanOrEqual(1_500);
  });

  it("trims explicit limits to the largest result that fits the output budget", () => {
    for (const query of ["low impact accessible equipment", "functional training"]) {
      const matches = equipmentCatalog.filter((item) =>
        matchesEquipmentSearch(item, { query, availableOnly: true }),
      );
      const toolResult = createEquipmentSearchToolResult(matches, 3);

      expect(matches.length).toBeGreaterThanOrEqual(3);
      expect(toolResult).toMatchObject({
        count: matches.length,
        returned: 2,
        truncated: true,
      });
      expect(JSON.stringify({ ok: true, data: toolResult }).length).toBeLessThanOrEqual(1_500);
    }
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

  it("returns cable trainers, not the push sled, for unconstrained trainer searches", () => {
    const matches = equipmentCatalog.filter((item) =>
      matchesEquipmentSearch(item, {
        query: "functional trainers",
      }),
    );

    expect(matches.map((item) => item.id)).toEqual([
      "lf_dual_adjustable_pulley",
      "torque_f9_functional_trainer",
    ]);
  });

  it("derives legacy operating areas from each record's per-side clearance", () => {
    const pulley = equipmentCatalog.find((item) => item.id === "lf_dual_adjustable_pulley");
    if (!pulley) throw new Error("Expected the pulley fixture in the equipment catalog");

    expect(getEquipmentOperatingDimensions(pulley)).toEqual({
      length: 356,
      width: 402,
      height: 242,
    });
    expect(compactEquipmentForTool(pulley).operatingDimensionsCm).toEqual({
      length: 356,
      width: 402,
      height: 242,
    });
    expect(
      matchesEquipmentSearch(pulley, {
        query: "functional trainer",
        maxWidthCm: 200,
        maxDepthCm: 220,
      }),
    ).toBe(false);
    expect(
      matchesEquipmentSearch(pulley, {
        query: "functional trainer",
        maxWidthCm: 402,
        maxDepthCm: 356,
      }),
    ).toBe(true);
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

  it("uses explicit planning areas for every newly added equipment record", () => {
    const addedEquipmentIds = [
      "hs_linear_leg_press",
      "hs_iso_lateral_high_row",
      "rogue_sml_2c_squat_stand",
      "torque_hex_dumbbell_rack",
      "torque_f9_functional_trainer",
      "torque_tank_m1",
      "balanced_body_allegro_2",
      "balanced_body_combo_chair",
      "nustep_t6max",
      "scifit_stepone",
    ];
    const addedEquipment = equipmentCatalog.filter((item) => addedEquipmentIds.includes(item.id));

    expect(addedEquipment).toHaveLength(addedEquipmentIds.length);
    expect(addedEquipment.every((item) => item.operatingDimensionsCm !== undefined)).toBe(true);

    const comboChair = addedEquipment.find((item) => item.id === "balanced_body_combo_chair");
    if (!comboChair) throw new Error("Expected the Combo Chair fixture in the equipment catalog");

    expect(
      matchesEquipmentSearch(comboChair, {
        query: "combo chair",
        maxWidthCm: 75,
        maxDepthCm: 75,
      }),
    ).toBe(false);
    expect(
      matchesEquipmentSearch(comboChair, {
        query: "combo chair",
        maxWidthCm: 252,
        maxDepthCm: 254,
      }),
    ).toBe(true);
  });
});
