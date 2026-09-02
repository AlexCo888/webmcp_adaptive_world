import {
  AgentGeneratedRoutineInputSchema,
  GeneratedSessionSchema,
  RoutineGoalSchema,
  type AgentGeneratedRoutineInput,
  type Equipment,
  type GeneratedSession,
  type GymContextProjection,
  type RoutineProIntent,
} from "@adaptive-world/contracts";
import { equipmentCatalogVersion } from "@adaptive-world/demo-data";

export const AGENT_GENERATED_ROUTINE_MARKER = "webmcp_agent_generated" as const;
export const AGENT_GENERATED_ROUTINE_VERSION = "1.0" as const;
export const EXPERT_REVIEW_WARNING =
  "AI-generated personalized draft. A physician or qualified physical therapist should review and approve this routine before it is performed.";

/**
 * Server-side bounds applied to every agent-generated routine. They are shared
 * with the agent through `get_active_context` so a proposal can be shaped
 * correctly before any confirmation or payment.
 */
export const AGENT_ROUTINE_BOUNDS = {
  minDurationMinutes: 10,
  maxExercises: 12,
  maxExerciseMinutes: 45,
  maxTransitionMinutes: 30,
  intensities: ["easy", "moderate"],
  maxInstructionsPerExercise: 5,
  maxSafetyNotes: 8,
} as const;

/** Safe, human-readable validation failure about the caller's own submission. */
export class RoutineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutineValidationError";
  }
}

export function maximumAgentRoutineMinutes(
  profile: Pick<GymContextProjection, "preferredSessionMinutes">,
): number {
  return Math.min(120, Math.max(30, profile.preferredSessionMinutes + 30));
}

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

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function uniqueNotes(values: readonly string[]): string[] {
  return values
    .map((value) => value.trim().slice(0, 200))
    .filter((value, index, notes) => value.length >= 2 && notes.indexOf(value) === index);
}

function routineText(routine: AgentGeneratedRoutineInput): string {
  return searchText([
    routine.title,
    ...(routine.warmup ?? []),
    ...(routine.cooldown ?? []),
    ...routine.safetyNotes,
    ...(routine.expertReviewReason ? [routine.expertReviewReason] : []),
    ...routine.exercises.flatMap((exercise) => [
      ...exercise.instructions,
      exercise.adaptationReason,
    ]),
  ]);
}

function containsMedicalApprovalClaim(value: string): boolean {
  return [
    /\b(?:doctor|physician|physical therapist|physiotherapist|clinician)\s+(?:has\s+)?(?:approved|recommended|cleared|authorized)\b/u,
    /\b(?:approved|recommended|cleared|authorized)\s+by\s+(?:a\s+|the\s+|your\s+)?(?:doctor|physician|physical therapist|physiotherapist|clinician)\b/u,
    /\b(?:medically|clinically)\s+cleared\b/u,
    /\b(?:aprobado|recomendado|autorizado)\s+por\s+(?:un\s+|una\s+|el\s+|la\s+)?(?:medico|doctor|fisioterapeuta|profesional de salud)\b/u,
    /\b(?:alta medica|medicamente autorizado)\b/u,
  ].some((pattern) => pattern.test(value));
}

/**
 * Every projected field and the routine's own text are scanned, so an injury,
 * rehabilitation, post-operative, or undocumented-clearance signal that appears
 * only in Passport goals, the approved requested goal, stop signals, or the
 * agent's instructions still requires professional review.
 */
function contextRequiresExpertReview(
  profile: GymContextProjection,
  goal: string,
  routine: AgentGeneratedRoutineInput,
): boolean {
  const value = searchText([
    goal,
    ...(profile.requestedRoutineGoal ? [profile.requestedRoutineGoal] : []),
    ...profile.goals,
    ...profile.movementConsiderations,
    ...profile.avoid,
    ...profile.stopSignals,
    ...profile.functionalCapabilities,
    ...profile.accessibilityNeeds,
    routineText(routine),
  ]);
  return includesAny(value, [
    "injury",
    "injured",
    "fracture",
    "broken leg",
    "broken bone",
    "post-op",
    "postoperative",
    "surgery",
    "rehab",
    "rehabilitation",
    "recovering from",
    "recovery from",
    "injury recovery",
    "post-injury",
    "weight-bearing",
    "weight bearing",
    "clearance undocumented",
    "clearance unknown",
    "not medically cleared",
    "sprain",
    "tendon tear",
    "ligament tear",
    "lesion",
    "lesionado",
    "fractura",
    "pierna rota",
    "pierna quebrada",
    "cirugia",
    "postoperatorio",
    "rehabilitacion",
    "recuperacion",
    "apoyo de peso",
    "carga de peso",
    "alta medica no documentada",
    "esguince",
  ]);
}

export function defaultRoutineGoal(profile: GymContextProjection): string {
  if (profile.requestedRoutineGoal) return profile.requestedRoutineGoal;
  const goals = profile.goals.slice(0, 3).join("; ");
  return (goals || "Support long-term health with a balanced, sustainable routine").slice(0, 160);
}

/** Public staff walkthrough selection. Personalized Routine Pro never calls this function. */
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
    "fisicocultor",
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
  if (!template) throw new RoutineValidationError("That staff walkthrough does not exist.");
  const selected = template.stations.map((station) => {
    const item = equipment.find((candidate) => candidate.id === station.equipmentId);
    if (!item?.available) {
      throw new RoutineValidationError(
        `The ${station.equipmentId} station is not currently available.`,
      );
    }
    return { station, item };
  });
  const requestedGoal = goal.trim();
  const safetyNotes = uniqueNotes([
    ...profile.stopSignals,
    ...profile.movementConsiderations,
    ...profile.avoid,
    "Ask Gym staff to confirm every first-use setup and stop whenever the setup feels wrong.",
  ]).slice(0, 24);

  return GeneratedSessionSchema.parse({
    id: sessionId,
    projectionId: profile.projectionId,
    title: template.name,
    goal: requestedGoal,
    templateId: template.id,
    templateVersion: template.version,
    generationMode: "staff_template",
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
    warmup: [],
    cooldown: [],
    safetyNotes,
    requiresExpertReview: false,
    decisionTrace: [
      `Preserved the person's stated goal: ${requestedGoal}`,
      `Loaded ${template.id}@${template.version}, authored by ${template.staffAuthor}.`,
      `Read the active Gym-only projection from the server session; the request contained no Passport profile.`,
      `Verified all ${selected.length} station IDs against catalog ${equipmentCatalogVersion}.`,
      `Requested through ${createdVia === "webmcp" ? "WebMCP" : "the Gym site"}. This is a published staff walkthrough; no AI model generated it.`,
    ],
    createdAt: new Date().toISOString(),
  });
}

export function createAgentGeneratedSession({
  profile,
  equipment,
  goal,
  routine,
  sessionId,
  createdAt = new Date().toISOString(),
}: {
  profile: GymContextProjection;
  equipment: Equipment[];
  goal: string;
  routine: AgentGeneratedRoutineInput;
  sessionId: string;
  createdAt?: string;
}): GeneratedSession {
  const requestedGoal = RoutineGoalSchema.parse(goal);
  const submitted = AgentGeneratedRoutineInputSchema.parse(routine);
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const exerciseMinutes = submitted.exercises.reduce(
    (total, exercise) => total + exercise.durationMinutes,
    0,
  );
  const maximumDuration = maximumAgentRoutineMinutes(profile);

  if (submitted.durationMinutes > maximumDuration) {
    throw new RoutineValidationError(
      `Routine duration exceeds the active context bound of ${maximumDuration} minutes (preferred session length plus 30).`,
    );
  }
  if (
    exerciseMinutes > submitted.durationMinutes ||
    submitted.durationMinutes - exerciseMinutes > 30
  ) {
    throw new RoutineValidationError(
      `Exercise minutes must fit the declared routine duration with no more than ${AGENT_ROUTINE_BOUNDS.maxTransitionMinutes} minutes reserved for warm-up, cooldown, and transitions.`,
    );
  }

  const hydratedExercises = submitted.exercises.map((exercise) => {
    if (seen.has(exercise.equipmentId)) {
      throw new RoutineValidationError("Each equipment item may appear only once in a routine.");
    }
    seen.add(exercise.equipmentId);
    const item = equipmentById.get(exercise.equipmentId);
    if (!item) {
      throw new RoutineValidationError(
        `Equipment ${exercise.equipmentId} is not in the current Gym catalog.`,
      );
    }
    if (!item.available) {
      throw new RoutineValidationError(
        `Equipment ${exercise.equipmentId} is not currently available.`,
      );
    }
    return {
      equipmentId: item.id,
      name: item.name,
      durationMinutes: exercise.durationMinutes,
      intensity: exercise.intensity,
      instructions: exercise.instructions,
      adaptationReason: exercise.adaptationReason,
    };
  });

  if (containsMedicalApprovalClaim(searchText([requestedGoal, routineText(submitted)]))) {
    throw new RoutineValidationError(
      "The routine must not claim medical clearance, physician approval, or professional recommendation.",
    );
  }

  const needsExpertReview = contextRequiresExpertReview(profile, requestedGoal, submitted);
  if (needsExpertReview && !submitted.requiresExpertReview) {
    throw new RoutineValidationError(
      "Injury, rehabilitation, or undocumented-clearance scenarios require requiresExpertReview=true.",
    );
  }
  const expertReviewReason = submitted.requiresExpertReview
    ? (submitted.expertReviewReason ??
      "The approved context includes an injury, rehabilitation, or clearance uncertainty that requires professional review.")
    : undefined;

  const safetyNotes = uniqueNotes([
    ...profile.stopSignals,
    ...submitted.safetyNotes,
    ...(submitted.requiresExpertReview ? [EXPERT_REVIEW_WARNING] : []),
    "Stop immediately if a Passport stop signal appears or the setup feels unsafe.",
  ]).slice(0, 24);
  for (const signal of profile.stopSignals) {
    if (!safetyNotes.includes(signal.slice(0, 200))) {
      throw new RoutineValidationError("All required Passport stop signals must be preserved.");
    }
  }

  return GeneratedSessionSchema.parse({
    id: sessionId,
    projectionId: profile.projectionId,
    title: submitted.title,
    goal: requestedGoal,
    templateId: AGENT_GENERATED_ROUTINE_MARKER,
    templateVersion: AGENT_GENERATED_ROUTINE_VERSION,
    generationMode: "agent_generated",
    createdVia: "webmcp",
    catalogVersion: equipmentCatalogVersion,
    durationMinutes: submitted.durationMinutes,
    status: "draft",
    exercises: hydratedExercises,
    warmup: submitted.warmup ?? [],
    cooldown: submitted.cooldown ?? [],
    safetyNotes,
    requiresExpertReview: submitted.requiresExpertReview,
    ...(expertReviewReason ? { expertReviewReason } : {}),
    decisionTrace: [
      `Preserved the exact confirmed goal: ${requestedGoal}`,
      "The user-selected external agent generated the exercise content; Adaptive Gym called no AI model.",
      `Used only consented projection ${profile.projectionId}; no full Passport or document content was submitted.`,
      `Verified ${hydratedExercises.length} equipment IDs against catalog ${equipmentCatalogVersion}.`,
      "Hydrated canonical equipment names and provenance from the Gym catalog rather than trusting agent-supplied product facts.",
      `Preserved ${profile.stopSignals.length} required Passport stop signals.`,
      submitted.requiresExpertReview
        ? "Marked the draft for physician or qualified physical-therapist review before performance."
        : "No injury, rehabilitation, or undocumented-clearance signal requiring expert review was detected.",
      "Generation mode recorded as agent_generated and creation channel recorded as webmcp.",
    ],
    createdAt,
  });
}

export function agentRoutineInputMatchesSession({
  session,
  goal,
  routine,
}: {
  session: GeneratedSession;
  goal: string;
  routine: AgentGeneratedRoutineInput;
}): boolean {
  const submitted = AgentGeneratedRoutineInputSchema.safeParse(routine);
  const parsedSession = GeneratedSessionSchema.safeParse(session);
  const requestedGoal = RoutineGoalSchema.safeParse(goal);
  if (!submitted.success || !parsedSession.success || !requestedGoal.success) return false;
  const plan = parsedSession.data;
  const input = submitted.data;
  if (
    plan.templateId !== AGENT_GENERATED_ROUTINE_MARKER ||
    plan.templateVersion !== AGENT_GENERATED_ROUTINE_VERSION ||
    plan.generationMode !== "agent_generated" ||
    plan.createdVia !== "webmcp" ||
    plan.goal !== requestedGoal.data ||
    plan.title !== input.title ||
    plan.durationMinutes !== input.durationMinutes ||
    plan.requiresExpertReview !== input.requiresExpertReview ||
    !sameStringArray(plan.warmup, input.warmup ?? []) ||
    !sameStringArray(plan.cooldown, input.cooldown ?? []) ||
    plan.exercises.length !== input.exercises.length
  ) {
    return false;
  }
  if (input.expertReviewReason && plan.expertReviewReason !== input.expertReviewReason)
    return false;
  if (!input.safetyNotes.every((note) => plan.safetyNotes.includes(note))) return false;
  return input.exercises.every((exercise, index) => {
    const saved = plan.exercises[index];
    return (
      saved?.equipmentId === exercise.equipmentId &&
      saved.durationMinutes === exercise.durationMinutes &&
      saved.intensity === exercise.intensity &&
      sameStringArray(saved.instructions, exercise.instructions) &&
      saved.adaptationReason === exercise.adaptationReason
    );
  });
}

export function validateStagedAgentGeneratedSession({
  session,
  profile,
  equipment,
}: {
  session: unknown;
  profile: GymContextProjection;
  equipment: Equipment[];
}): GeneratedSession {
  const plan = GeneratedSessionSchema.parse(session);
  if (
    plan.templateId !== AGENT_GENERATED_ROUTINE_MARKER ||
    plan.templateVersion !== AGENT_GENERATED_ROUTINE_VERSION ||
    plan.generationMode !== "agent_generated" ||
    plan.createdVia !== "webmcp" ||
    plan.projectionId !== profile.projectionId
  ) {
    throw new RoutineValidationError("The staged plan is not an agent-generated WebMCP routine.");
  }
  const equipmentById = new Map(equipment.map((item) => [item.id, item]));
  const seen = new Set<string>();
  let exerciseMinutes = 0;
  for (const exercise of plan.exercises) {
    if (seen.has(exercise.equipmentId)) {
      throw new RoutineValidationError("The staged routine contains duplicate equipment.");
    }
    seen.add(exercise.equipmentId);
    const item = equipmentById.get(exercise.equipmentId);
    if (!item?.available || exercise.name !== item.name) {
      throw new RoutineValidationError(
        `The staged equipment ${exercise.equipmentId} is unavailable or not canonically hydrated.`,
      );
    }
    if (exercise.intensity !== "easy" && exercise.intensity !== "moderate") {
      throw new RoutineValidationError(
        "Agent-generated routines are limited to easy or moderate intensity.",
      );
    }
    exerciseMinutes += exercise.durationMinutes ?? 0;
  }
  if (exerciseMinutes > plan.durationMinutes || plan.durationMinutes - exerciseMinutes > 30) {
    throw new RoutineValidationError("The staged routine duration is inconsistent.");
  }
  for (const signal of profile.stopSignals) {
    if (!plan.safetyNotes.includes(signal.slice(0, 200))) {
      throw new RoutineValidationError("A required Passport stop signal is missing.");
    }
  }
  const stagedText = searchText([
    plan.goal,
    plan.title,
    ...plan.warmup,
    ...plan.cooldown,
    ...plan.safetyNotes,
    ...(plan.expertReviewReason ? [plan.expertReviewReason] : []),
    ...plan.exercises.flatMap((exercise) => [...exercise.instructions, exercise.adaptationReason]),
  ]);
  if (containsMedicalApprovalClaim(stagedText)) {
    throw new RoutineValidationError("The staged routine contains a medical-approval claim.");
  }
  const stagedInput: AgentGeneratedRoutineInput = {
    title: plan.title,
    durationMinutes: plan.durationMinutes,
    exercises: plan.exercises.map((exercise) => ({
      equipmentId: exercise.equipmentId,
      durationMinutes: exercise.durationMinutes ?? 1,
      intensity: exercise.intensity === "moderate" ? "moderate" : "easy",
      instructions: exercise.instructions,
      adaptationReason: exercise.adaptationReason,
    })),
    warmup: plan.warmup,
    cooldown: plan.cooldown,
    safetyNotes: plan.safetyNotes.slice(0, 8),
    requiresExpertReview: plan.requiresExpertReview,
    expertReviewReason: plan.expertReviewReason,
  };
  if (contextRequiresExpertReview(profile, plan.goal, stagedInput) && !plan.requiresExpertReview) {
    throw new RoutineValidationError("The staged routine must require expert review.");
  }
  return plan;
}

export function validateStagedStaffWalkthroughSession({
  session,
  profile,
  equipment,
}: {
  session: unknown;
  profile: GymContextProjection;
  equipment: Equipment[];
}): GeneratedSession {
  const plan = GeneratedSessionSchema.parse(session);
  const template = facilityTemplates.find((item) => item.id === plan.templateId);
  if (
    !template ||
    plan.generationMode !== "staff_template" ||
    plan.templateVersion !== template.version ||
    plan.projectionId !== profile.projectionId
  ) {
    throw new RoutineValidationError("The staged plan is not a published staff walkthrough.");
  }
  if (
    plan.exercises.length !== template.stations.length ||
    !plan.exercises.every((exercise, index) => {
      const station = template.stations[index];
      const item = equipment.find((candidate) => candidate.id === exercise.equipmentId);
      return (
        station?.equipmentId === exercise.equipmentId &&
        item?.available === true &&
        exercise.name === item.name
      );
    })
  ) {
    throw new RoutineValidationError(
      "The staged walkthrough no longer matches the published stations or current availability.",
    );
  }
  for (const signal of profile.stopSignals) {
    if (!plan.safetyNotes.includes(signal.slice(0, 200))) {
      throw new RoutineValidationError("A required Passport stop signal is missing.");
    }
  }
  return plan;
}

/** Re-validates any staged plan against the live projection and catalog. */
export function validateStagedRoutineSession(input: {
  session: unknown;
  profile: GymContextProjection;
  equipment: Equipment[];
}): GeneratedSession {
  const parsed = GeneratedSessionSchema.safeParse(input.session);
  if (!parsed.success) throw new RoutineValidationError("No valid routine is staged.");
  return parsed.data.generationMode === "agent_generated"
    ? validateStagedAgentGeneratedSession(input)
    : validateStagedStaffWalkthroughSession(input);
}

/** The provenance identifier an order records for a Routine Pro intent. */
export function routineIntentProvenanceId(intent: RoutineProIntent): string {
  return intent.initiatedVia === "webmcp" ? AGENT_GENERATED_ROUTINE_MARKER : intent.templateId;
}

/** True only when the staged or saved plan is exactly what the person confirmed. */
export function routineIntentMatchesSession({
  session,
  intent,
}: {
  session: GeneratedSession;
  intent: RoutineProIntent;
}): boolean {
  const requestedGoal = RoutineGoalSchema.safeParse(intent.goal);
  if (!requestedGoal.success || session.goal !== requestedGoal.data) return false;
  if (intent.initiatedVia === "webmcp") {
    return agentRoutineInputMatchesSession({
      session,
      goal: requestedGoal.data,
      routine: intent.routine,
    });
  }
  return (
    session.generationMode === "staff_template" &&
    session.createdVia === "site-ui" &&
    session.templateId === intent.templateId
  );
}
