import type { GymContextProjection } from "@adaptive-world/contracts";
import { describe, expect, it } from "vitest";
import { defaultRoutineGoal, recommendFacilityTemplate } from "./session-planner";

const projection: GymContextProjection = {
  projectionId: "gym_projection_0123456789abcdef01234567",
  subjectAlias: "Passport member",
  purpose: "adaptive_gym_session",
  goals: ["Build whole-body strength", "Improve mobility", "Run 5 km comfortably"],
  experienceLevel: "intermediate",
  preferredSessionMinutes: 55,
  preferredActivities: ["Free weights", "Incline walking", "Pilates"],
  functionalCapabilities: ["165 weekly activity minutes reported"],
  movementConsiderations: ["Keep overhead volume moderate"],
  avoid: [],
  stopSignals: ["Chest pain"],
  accessibilityNeeds: [],
  sourceCategories: ["self_reported"],
  issuedAt: "2026-08-30T14:00:00.000Z",
  expiresAt: "2026-08-30T14:05:00.000Z",
  synthetic: true,
};

describe("natural-language staff-template matching", () => {
  it("maps the demo's lifelong-health, non-bodybuilding goal to balanced low-impact work", () => {
    expect(
      recommendFacilityTemplate(
        projection,
        "I want the healthiest possible life without becoming a bodybuilder",
      ),
    ).toBe("low_impact_orientation");
    expect(
      recommendFacilityTemplate(
        projection,
        "Quiero la vida más saludable posible sin exagerar músculos; no quiero ser fisicocultorista",
      ),
    ).toBe("low_impact_orientation");
  });

  it("prioritizes declared access needs over generic goal keywords", () => {
    expect(
      recommendFacilityTemplate(
        { ...projection, accessibilityNeeds: ["Wheelchair-accessible approach"] },
        "Support long-term health",
      ),
    ).toBe("accessible_equipment_tour");
  });

  it("lets a specific current request select a different safe staff template", () => {
    expect(
      recommendFacilityTemplate(
        projection,
        "Show me the basic strength equipment and how the main training floor works",
      ),
    ).toBe("first_visit_foundations");
  });

  it("prefers the approved requested goal and falls back to Passport goals", () => {
    expect(
      defaultRoutineGoal({
        ...projection,
        requestedRoutineGoal: "Support lifelong health without bodybuilding-style muscle gain",
      }),
    ).toBe("Support lifelong health without bodybuilding-style muscle gain");
    expect(defaultRoutineGoal(projection)).toBe(
      "Build whole-body strength; Improve mobility; Run 5 km comfortably",
    );
  });
});
