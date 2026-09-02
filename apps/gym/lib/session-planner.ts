import type {
  AgentGeneratedRoutine,
  Equipment,
  GeneratedSession,
  GymContextProjection,
} from "@adaptive-world/contracts";
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

export const AGENT_GENERATED_TEMPLATE_ID = "webmcp_agent_generated" as const;
export const AGENT_GENERATED_TEMPLATE_VERSION = "1.0" as const;
export const PROFESSIONAL_REVIEW_WARNING =
  "AI-generated personalized draft. A physician or qualified physical therapist should review and approve this routine before it is performed.";

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

function searchText(values: readonly string[]): string {
  return values
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase();
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => value.includes(term));
}

function uniqueNotes(notes: readonly string[], limit: number): string[] {
  return notes
    .map((note) => note.trim().slice(0, 200))
    .filter((note, index, values) => note.length >= 2 && values.indexOf(note) === index)
    .slice(0, limit);
}

export function defaultRoutineGoal(profile: GymContextProjection): string {
  if (profile.requestedRoutineGoal) return profile.requestedRoutineGoal;
  const goals = profile.goals.slice(0, 3).join("; ");
  return (goals || "Support long-term health with a balanced, sustainable routine").slice(0, 160);
}

/** Deterministic staff-walkthrough selection for the public facility examples. */
export function recommendFacilityTemplate(
  profile: GymContextProjection,
  goal: string,
): FacilityTemplate["id"] {
  const requestedGoal = searchText([goal]);
  const passportContext = searchText([
    ...profile.goals,
    ...profile.preferredActivities,
    ...profile.accessibilityNeeds,
  ]);
  const accessTerms = [
    "accessible",
    "accessibility",
    "wheelchair",
    "limited mobility",
    "adaptive equipment",
    "accesible",
    "silla de ruedas",
  ] as const;
  const sustainableTerms = [
    "health",
    "healthy",
    "long-term",
    "longevity",
    "balanced",
    "wellness",
    "cardio",
    "gentle",
    "low impact",
    "mobility",
    "not bodybuilding",
    "without bodybuilding",
    "bodybuilder",
    "fisicocultur",
    "salud",
    "saludable",
    "sin exagerar musculo",
  ] as const;
  const foundationTerms = [
    "first visit",
    "orientation",
    "strength equipment",
    "training floor",
    "free weights",
    "primera visita",
    "equipo de fuerza",
  ] as const;
  if (profile.accessibilityNeeds.length > 0 || includesAny(requestedGoal, accessTerms)) {
    return "accessible_equipment_tour";
  }
  if (includesAny(requestedGoal, sustainableTerms)) return "low_impact_orientation";
  if (includesAny(requestedGoal, foundationTerms)) return "first_visit_foundations";
  if (includesAny(passportContext, accessTerms)) return "accessible_equipment_tour";
  if (includesAny(passportContext, sustainableTerms)) return "low_impact_orientation";
  return "first_visit_foundations";
}

export function profileRequiresExpertReview(profile: GymContextProjection): boolean {
  const text = searchText([
    ...profile.functionalCapabilities,
    ...profile.movementConsiderations,
    ...profile.avoid,
    ...profile.stopSignals,
  ]);
  return includesAny(text, [
    "injury",
    "injured",
    "fracture",
    "broken",
    "surgery",
    "post-op",
    "post op",
    "rehab",
    "rehabilitation",
    "recovering",
    "weight-bearing",
    "weight bearing",
    "clearance undocumented",
    "undocumented clearance",
    "clearance unknown",
    "unknown clearance",
    "not cleared",
    "pending clearance",
    "lesion",
    "lesionado",
    "fractura",
    "rehabilitacion",
  ]);
}

function containsMedicalApprovalClaim(routine: AgentGeneratedRoutine): boolean {
  const text = searchText([
    routine.title,
    ...routine.safetyNotes,
    ...(routine.warmup ?? []),
    ...(routine.cooldown ?? []),
    routine.expertReviewReason ?? "",
    ...routine.exercises.flatMap((exercise) => [
      exercise.adaptationReason,
      ...exercise.instructions,
    ]),
  ]);
  return [
    /(?:doctor|physician|physical therapist|therapist|pt).{0,35}(?:approved|cleared|recommended|authorized)/u,
    /(?:approved|cleared|recommended|authorized).{0,35}(?:doctor|physician|physical therapist|therapist|pt)/u,
    /medically cleared/u,
  ].some((pattern) => pattern.test(text));
}

export function createAgentGeneratedSession({
  profile,
  equipment,
  routine,
  goal,
  sessionId,
}: {
  profile: GymContextProjection;
  equipment: Equipment[];
  routine: AgentGeneratedRoutine;
  goal: string;
  sessionId: string;
}): GeneratedSession {
  const requestedGoal = goal.trim();
  if (profile.requestedRoutineGoal && profile.requestedRoutineGoal.trim() !== requestedGoal) {
    throw new Error("The submitted goal does not match the active Passport projection.");
  }
  if (containsMedicalApprovalClaim(routine)) {
    throw new Error("The routine must not claim medical clearance or professional approval.");
  }
  const contextRequiresReview = profileRequiresExpertReview(profile);
  if (contextRequiresReview && !routine.requiresExpertReview) {
    throw new Error("The active injury or clearance context requires expert review.");
  }

  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const selected = routine.exercises.map((exercise) => {
    const item = equipmentById.get(exercise.equipmentId);
    if (!item || !item.available) {
      throw new Error(`Equipment ${exercise.equipmentId} is not currently available.`);
    }
    return { exercise, item };
  });
  const exerciseMinutes = selected.reduce(
    (total, entry) => total + entry.exercise.durationMinutes,
    0,
  );
  if (exerciseMinutes > routine.durationMinutes) {
    throw new Error("Exercise minutes exceed the submitted routine duration.");
  }

  const requiresExpertReview = contextRequiresReview || routine.requiresExpertReview;
  const expertReviewReason = requiresExpertReview
    ? (routine.expertReviewReason ??
      "The active Passport projection contains injury, rehabilitation, or unresolved clearance context.")
    : undefined;
  const safetyNotes = uniqueNotes(
    [
      ...profile.stopSignals,
      ...profile.movementConsiderations,
      ...profile.avoid,
      ...routine.safetyNotes,
      ...(requiresExpertReview ? [PROFESSIONAL_REVIEW_WARNING] : []),
      "Ask Gym staff to confirm every first-use setup and stop whenever the setup feels wrong.",
    ],
    12,
  );

  return {
    id: sessionId,
    projectionId: profile.projectionId,
    title: routine.title.trim(),
    goal: requestedGoal,
    templateId: AGENT_GENERATED_TEMPLATE_ID,
    templateVersion: AGENT_GENERATED_TEMPLATE_VERSION,
    createdVia: "webmcp",
    generationMode: "agent_generated",
    catalogVersion: equipmentCatalogVersion,
    durationMinutes: routine.durationMinutes,
    status: "draft",
    exercises: selected.map(({ exercise, item }) => ({
      equipmentId: item.id,
      name: item.name,
      durationMinutes: exercise.durationMinutes,
      intensity: exercise.intensity,
      instructions: [...exercise.instructions],
      adaptationReason: exercise.adaptationReason,
      manufacturer: item.manufacturer,
      model: item.model,
      sourceUrl: item.sourceUrl,
      sourceLabel: item.sourceLabel,
      sourceCheckedAt: item.sourceCheckedAt,
      capabilities: item.capabilities,
      accessibility: item.accessibility,
      locationZone: item.locationZone,
    })),
    ...(routine.warmup?.length ? { warmup: [...routine.warmup] } : {}),
    ...(routine.cooldown?.length ? { cooldown: [...routine.cooldown] } : {}),
    safetyNotes,
    requiresExpertReview,
    ...(expertReviewReason ? { expertReviewReason } : {}),
    decisionTrace: [
      `Preserved the person's confirmed goal: ${requestedGoal}`,
      "Generated by the user-selected agent from the approved Passport projection and verified Gym inventory. Validated and saved by Adaptive Gym.",
      "The Gym received equipment IDs only and hydrated canonical names, models, sources, and catalog facts server-side.",
      `Verified all ${selected.length} equipment IDs against catalog ${equipmentCatalogVersion} and current availability.`,
      `Preserved ${profile.stopSignals.length} Passport stop signal(s) in the saved safety notes.`,
      requiresExpertReview
        ? "Professional review is required because the active context includes injury, rehabilitation, or unresolved clearance uncertainty."
        : "The active minimum projection did not trigger the injury/rehabilitation expert-review boundary.",
      "Generation mode: agent_generated; invocation source: webmcp. No staff template content was loaded.",
    ],
    createdAt: new Date().toISOString(),
  };
}

export function createGroundedSession({
  profile,
  equipment,
  templateId,
  goal,
  createdVia,
  sessionId,
}: {
  profile: GymContextProjection;
  equipment: Equipment[];
  templateId: FacilityTemplate["id"];
  goal: string;
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
  const requestedGoal = goal.trim();
  const safetyNotes = uniqueNotes(
    [
      ...profile.stopSignals,
      ...profile.movementConsiderations,
      ...profile.avoid,
      "Ask Gym staff to confirm every first-use setup and stop whenever the setup feels wrong.",
    ],
    8,
  );

  return {
    id: sessionId,
    projectionId: profile.projectionId,
    title: template.name,
    goal: requestedGoal,
    templateId: template.id,
    templateVersion: template.version,
    createdVia,
    generationMode: "staff_template",
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
    safetyNotes,
    decisionTrace: [
      `Preserved the person's stated goal: ${requestedGoal}`,
      `Loaded ${template.id}@${template.version}, authored by ${template.staffAuthor}.`,
      "This public staff walkthrough is separate from the personalized Routine Pro WebMCP flow.",
      `Verified all ${selected.length} station IDs against catalog ${equipmentCatalogVersion}.`,
      contextSignals.length
        ? `Kept ${contextSignals.length} approved movement/access signals visible for human review.`
        : "No additional movement or access signals were present in the minimum projection.",
    ],
    createdAt: new Date().toISOString(),
  };
}
