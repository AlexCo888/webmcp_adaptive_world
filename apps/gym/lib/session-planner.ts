import type { Equipment, GeneratedSession, GymContextProjection } from "@adaptive-world/contracts";
import { equipmentCatalogVersion } from "@adaptive-world/demo-data";

type Station = {
  equipmentId: string;
  minutes: number;
  intensity: "easy" | "moderate";
  instructions: string[];
  reason: string;
};

export type FacilityTemplate = {
  id: "first_visit_foundations" | "low_impact_orientation" | "accessible_equipment_tour";
  version: "1.0";
  name: string;
  summary: string;
  durationMinutes: number;
  bestFor: string;
  staffAuthor: string;
  stations: Station[];
};

export const facilityTemplates: readonly FacilityTemplate[] = [
  {
    id: "first_visit_foundations",
    version: "1.0",
    name: "First-visit equipment foundations",
    summary:
      "A staff-authored orientation to cardio, supported push/pull stations, and adjustable cables.",
    durationMinutes: 42,
    bestFor: "A first visit or a calm introduction to the main training floor",
    staffAuthor: "Adaptive Gym coaching team",
    stations: [
      {
        equipmentId: "lf_integrity_plus_treadmill",
        minutes: 8,
        intensity: "easy",
        instructions: [
          "Ask staff to demonstrate the stop control and handrail position.",
          "Use a conversational walking pace; this block is an orientation, not a test.",
        ],
        reason: "Introduces the cardio floor and safety controls.",
      },
      {
        equipmentId: "lf_insignia_chest_press",
        minutes: 8,
        intensity: "easy",
        instructions: [
          "Set the seat with staff so handles begin at a comfortable chest height.",
          "Practice the path with the lightest useful setting and stop well before fatigue.",
        ],
        reason: "Introduces a supported horizontal push pattern.",
      },
      {
        equipmentId: "lf_insignia_row",
        minutes: 8,
        intensity: "easy",
        instructions: [
          "Adjust the seat and chest support before moving the stack.",
          "Practice an even pull while keeping the supported position comfortable.",
        ],
        reason: "Pairs the supported press with a supported pull station.",
      },
      {
        equipmentId: "lf_dual_adjustable_pulley",
        minutes: 10,
        intensity: "easy",
        instructions: [
          "Ask staff to demonstrate carriage adjustment and the clear approach area.",
          "Explore one comfortable push and one comfortable pull without chasing fatigue.",
        ],
        reason: "Shows how one verified station can support several future movement choices.",
      },
    ],
  },
  {
    id: "low_impact_orientation",
    version: "1.0",
    name: "Low-impact cardio & guided strength",
    summary:
      "A staff-authored walkthrough using seated cardio and supported selectorized machines.",
    durationMinutes: 40,
    bestFor: "Low-impact preferences, gradual pacing, or a supported first session",
    staffAuthor: "Adaptive Gym coaching team",
    stations: [
      {
        equipmentId: "lf_integrity_recumbent",
        minutes: 10,
        intensity: "easy",
        instructions: [
          "Use the step-through entry and adjust the seat before starting.",
          "Keep the first visit conversational and learn the stop controls.",
        ],
        reason: "Provides a seated, low-impact introduction to the cardio floor.",
      },
      {
        equipmentId: "scifit_pro2_total_body",
        minutes: 8,
        intensity: "easy",
        instructions: [
          "Ask staff whether the standard or removable-seat setup fits today.",
          "Explore a smooth, low-resistance motion without treating the block as a performance test.",
        ],
        reason: "Adds an inclusive upper/lower-body option with documented access features.",
      },
      {
        equipmentId: "lf_insignia_chest_press",
        minutes: 8,
        intensity: "easy",
        instructions: [
          "Set the seat before selecting resistance.",
          "Practice the guided path and finish while the movement still feels easy to repeat.",
        ],
        reason: "Introduces supported strength on a manufacturer-verified station.",
      },
      {
        equipmentId: "lf_insignia_row",
        minutes: 8,
        intensity: "easy",
        instructions: [
          "Use the chest support and confirm the seat height with staff.",
          "Practice a smooth pull and note any setup preference for next time.",
        ],
        reason: "Balances the guided strength orientation with a supported pull.",
      },
    ],
  },
  {
    id: "accessible_equipment_tour",
    version: "1.0",
    name: "Accessible equipment tour",
    summary:
      "A staff-led route through equipment with documented step-through, removable-seat, and open-approach features.",
    durationMinutes: 36,
    bestFor: "Visitors who want access features and setup options reviewed first",
    staffAuthor: "Adaptive Gym accessibility lead",
    stations: [
      {
        equipmentId: "scifit_pro2_total_body",
        minutes: 10,
        intensity: "easy",
        instructions: [
          "Review the step-through and removable-seat configurations with staff.",
          "Choose the setup that preserves a clear, comfortable approach.",
        ],
        reason: "Starts with the catalog's most explicitly inclusive cardio station.",
      },
      {
        equipmentId: "lf_integrity_recumbent",
        minutes: 8,
        intensity: "easy",
        instructions: [
          "Review the step-through entry and wrap-around seat lever.",
          "Confirm that the seat position supports a comfortable pedal path.",
        ],
        reason: "Demonstrates a second seated cardio option with documented entry features.",
      },
      {
        equipmentId: "lf_dual_adjustable_pulley",
        minutes: 10,
        intensity: "easy",
        instructions: [
          "Ask staff to clear the approach and demonstrate independent carriage heights.",
          "Try one comfortable handle position and record the preferred carriage setting.",
        ],
        reason: "Provides an open approach and low starting resistance.",
      },
      {
        equipmentId: "lf_insignia_row",
        minutes: 6,
        intensity: "easy",
        instructions: [
          "Review entry, seat adjustment, and chest support before selecting resistance.",
          "Use the station only if the setup remains comfortable and easy to exit.",
        ],
        reason: "Introduces a supported strength station with an open entry.",
      },
    ],
  },
] as const;

export function createGroundedSession({
  profile,
  equipment,
  templateId,
  createdVia,
  sessionId,
}: {
  profile: GymContextProjection;
  equipment: Equipment[];
  templateId: FacilityTemplate["id"];
  createdVia: "site-ui" | "webmcp";
  sessionId: string;
}): GeneratedSession {
  const template = facilityTemplates.find((item) => item.id === templateId);
  if (!template) throw new Error("That staff-authored walkthrough does not exist.");
  const selected = template.stations.map((station) => {
    const item = equipment.find((candidate) => candidate.id === station.equipmentId);
    if (!item?.available) {
      throw new Error(`The ${station.equipmentId} station is not currently available.`);
    }
    return { station, item };
  });
  const contextSignals = [...profile.movementConsiderations, ...profile.accessibilityNeeds];

  return {
    id: sessionId,
    projectionId: profile.projectionId,
    title: template.name,
    goal: template.bestFor,
    templateId: template.id,
    templateVersion: template.version,
    createdVia,
    catalogVersion: equipmentCatalogVersion,
    durationMinutes: template.durationMinutes,
    status: "draft",
    exercises: selected.map(({ station, item }) => ({
      equipmentId: item.id,
      name: item.name,
      durationMinutes: station.minutes,
      intensity: station.intensity,
      instructions: station.instructions,
      adaptationReason: station.reason,
    })),
    safetyNotes: [
      ...profile.stopSignals.slice(0, 4),
      "Ask Gym staff to confirm every first-use setup and stop whenever the setup feels wrong.",
    ],
    decisionTrace: [
      `Loaded ${template.id}@${template.version}, authored by ${template.staffAuthor}.`,
      `Read the active Gym-only projection from the server session; the request contained no Passport profile.`,
      `Verified all ${selected.length} station IDs against catalog ${equipmentCatalogVersion}.`,
      contextSignals.length
        ? `Kept ${contextSignals.length} approved movement/access signals visible for human review.`
        : "No additional movement or access signals were present in the minimum projection.",
      `Invocation source recorded as ${createdVia}. WebMCP selected a template; it did not invent its contents.`,
    ],
    createdAt: new Date().toISOString(),
  };
}
