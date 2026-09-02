import {
  AgentGeneratedRoutineInputSchema,
  type AgentGeneratedRoutineInput,
  type GymContextProjection,
} from "@adaptive-world/contracts";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { describe, expect, it } from "vitest";
import {
  AGENT_GENERATED_ROUTINE_MARKER,
  EXPERT_REVIEW_WARNING,
  agentRoutineInputMatchesSession,
  createAgentGeneratedSession,
  defaultRoutineGoal,
  recommendFacilityTemplate,
} from "./session-planner";

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

const mateoProjection: GymContextProjection = {
  ...projection,
  subjectAlias: "Mateo",
  goals: ["Return gradually to regular activity"],
  preferredSessionMinutes: 35,
  movementConsiderations: [
    "Broken leg reported three months ago",
    "Weight-bearing clearance is undocumented",
  ],
  avoid: ["Do not progress lower-limb loading without documented clearance"],
  stopSignals: ["New or increasing pain", "Swelling", "Loss of balance"],
};

function mateoRoutine(
  overrides: Partial<AgentGeneratedRoutineInput> = {},
): AgentGeneratedRoutineInput {
  return {
    title: "Mateo cautious return-to-activity draft",
    durationMinutes: 30,
    exercises: [
      {
        equipmentId: "scifit_pro2_total_body",
        durationMinutes: 8,
        intensity: "easy",
        instructions: [
          "Ask staff to configure the removable seat before beginning.",
          "Use a smooth upper-body-dominant motion and stop before fatigue.",
        ],
        adaptationReason:
          "Keeps the first block seated and adjustable while lower-limb loading clearance remains undocumented.",
      },
      {
        equipmentId: "lf_insignia_row",
        durationMinutes: 8,
        intensity: "easy",
        instructions: [
          "Set the chest support and seat before selecting resistance.",
          "Use a comfortable range and finish while repetitions remain easy.",
        ],
        adaptationReason:
          "Adds supported upper-body work without claiming that weight-bearing activity is cleared.",
      },
    ],
    warmup: ["Review stop signals and equipment exits with Gym staff."],
    cooldown: ["Finish seated and reassess pain or swelling before standing."],
    safetyNotes: ["Do not interpret this draft as medical clearance."],
    requiresExpertReview: true,
    expertReviewReason:
      "Mateo reported a recent leg fracture and the approved projection does not document weight-bearing clearance.",
    ...overrides,
  };
}

describe("public staff walkthrough matching", () => {
  it("keeps the existing public walkthrough selection separate", () => {
    expect(
      recommendFacilityTemplate(
        projection,
        "I want the healthiest possible life without becoming a bodybuilder",
      ),
    ).toBe("low_impact_orientation");
    expect(
      recommendFacilityTemplate(
        { ...projection, accessibilityNeeds: ["Wheelchair-accessible approach"] },
        "Support long-term health",
      ),
    ).toBe("accessible_equipment_tour");
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

describe("agent-generated personalized routines", () => {
  it("hydrates canonical equipment and preserves Mateo's review boundary and stop signals", () => {
    const routine = mateoRoutine();
    const session = createAgentGeneratedSession({
      profile: mateoProjection,
      equipment: equipmentCatalog,
      goal: "Create a cautious routine for Mateo after a broken leg; weight-bearing clearance is undocumented.",
      routine,
      sessionId: "gym_routine_0123456789abcdef01234567",
      createdAt: "2026-09-01T12:00:00.000Z",
    });

    expect(session).toMatchObject({
      templateId: AGENT_GENERATED_ROUTINE_MARKER,
      templateVersion: "1.0",
      generationMode: "agent_generated",
      createdVia: "webmcp",
      requiresExpertReview: true,
    });
    expect(session.exercises.map((exercise) => exercise.name)).toEqual(
      routine.exercises.map(
        (exercise) => equipmentCatalog.find((item) => item.id === exercise.equipmentId)?.name,
      ),
    );
    expect(session.safetyNotes).toEqual(
      expect.arrayContaining([...mateoProjection.stopSignals, EXPERT_REVIEW_WARNING]),
    );
    expect(
      agentRoutineInputMatchesSession({
        session,
        goal: session.goal,
        routine,
      }),
    ).toBe(true);
  });

  it("requires professional review for injury and undocumented-clearance scenarios", () => {
    expect(() =>
      createAgentGeneratedSession({
        profile: mateoProjection,
        equipment: equipmentCatalog,
        goal: "Return after a broken leg without documented weight-bearing clearance",
        routine: mateoRoutine({ requiresExpertReview: false }),
        sessionId: "gym_routine_0123456789abcdef01234567",
      }),
    ).toThrow(/requiresExpertReview=true/u);
  });

  it("rejects invented or unavailable equipment", () => {
    expect(() =>
      createAgentGeneratedSession({
        profile: projection,
        equipment: equipmentCatalog,
        goal: "Build a balanced session",
        routine: mateoRoutine({
          exercises: [
            {
              ...mateoRoutine().exercises[0]!,
              equipmentId: "invented_machine",
            },
          ],
        }),
        sessionId: "gym_routine_0123456789abcdef01234567",
      }),
    ).toThrow(/not in the current Gym catalog/u);

    expect(() =>
      createAgentGeneratedSession({
        profile: projection,
        equipment: equipmentCatalog.map((item) =>
          item.id === "scifit_pro2_total_body" ? { ...item, available: false } : item,
        ),
        goal: "Build a balanced session",
        routine: mateoRoutine(),
        sessionId: "gym_routine_0123456789abcdef01234567",
      }),
    ).toThrow(/not currently available/u);
  });

  it("rejects medical-approval claims and arbitrary product fields", () => {
    expect(() =>
      createAgentGeneratedSession({
        profile: projection,
        equipment: equipmentCatalog,
        goal: "Build a balanced session",
        routine: mateoRoutine({
          exercises: [
            {
              ...mateoRoutine().exercises[0]!,
              instructions: ["A physician approved this exercise for Mateo."],
            },
          ],
        }),
        sessionId: "gym_routine_0123456789abcdef01234567",
      }),
    ).toThrow(/must not claim medical clearance/u);

    const untrusted = mateoRoutine() as AgentGeneratedRoutineInput & {
      exercises: Array<AgentGeneratedRoutineInput["exercises"][number] & { manufacturer: string }>;
    };
    untrusted.exercises[0] = {
      ...untrusted.exercises[0]!,
      manufacturer: "Invented manufacturer assertion",
    };
    expect(AgentGeneratedRoutineInputSchema.safeParse(untrusted).success).toBe(false);
  });
});
