import type { AgentGeneratedRoutineInput, GymContextProjection } from "@adaptive-world/contracts";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { describe, expect, it } from "vitest";
import {
  AGENT_GENERATED_ROUTINE_MARKER,
  createAgentGeneratedSession,
  createGroundedSession,
} from "@/lib/session-planner";
import { assertRoutineOrderInput, type RoutineProOrder } from "./orders";

const goal = "Support a cautious return to activity while clearance remains undocumented";
const gymSessionId = "00000000-0000-4000-8000-000000000004";
const profile: GymContextProjection = {
  projectionId: "gym_projection_0123456789abcdef01234567",
  subjectAlias: "Passport member",
  purpose: "adaptive_gym_session",
  goals: ["Return gradually to regular activity"],
  experienceLevel: "beginner",
  preferredSessionMinutes: 35,
  preferredActivities: ["Supported strength"],
  functionalCapabilities: ["Can transfer independently"],
  movementConsiderations: [
    "Broken leg reported three months ago",
    "Weight-bearing clearance is undocumented",
  ],
  avoid: ["Do not progress lower-limb loading without documented clearance"],
  stopSignals: ["New or increasing pain", "Swelling"],
  accessibilityNeeds: [],
  sourceCategories: ["self_reported"],
  issuedAt: "2026-09-01T12:00:00.000Z",
  expiresAt: "2026-09-01T13:00:00.000Z",
  synthetic: true,
};
const routine: AgentGeneratedRoutineInput = {
  title: "Cautious return-to-activity draft",
  durationMinutes: 24,
  exercises: [
    {
      equipmentId: "scifit_pro2_total_body",
      durationMinutes: 8,
      intensity: "easy",
      instructions: ["Ask staff to configure the removable seat before beginning."],
      adaptationReason: "Uses an adjustable seated setup while clearance remains uncertain.",
    },
    {
      equipmentId: "lf_insignia_row",
      durationMinutes: 8,
      intensity: "easy",
      instructions: ["Set the chest support and seat before selecting resistance."],
      adaptationReason: "Adds supported upper-body work without claiming medical clearance.",
    },
  ],
  warmup: ["Review stop signals with Gym staff."],
  cooldown: ["Reassess pain or swelling before standing."],
  safetyNotes: ["Do not interpret this draft as medical clearance."],
  requiresExpertReview: true,
  expertReviewReason:
    "The recent fracture and weight-bearing clearance uncertainty require professional review.",
};
const stagedSession = createAgentGeneratedSession({
  profile,
  equipment: equipmentCatalog,
  goal,
  routine,
  sessionId: "gym_routine_0123456789abcdef01234567",
  createdAt: "2026-09-01T12:00:00.000Z",
});
const order = {
  initiatedVia: "webmcp",
  initialTemplateId: AGENT_GENERATED_ROUTINE_MARKER,
  initialGoal: goal,
  gymSessionId,
} as RoutineProOrder;
const intent = { initiatedVia: "webmcp", goal, routine } as const;

function expectOrderPending(operation: () => void) {
  let caught: unknown;
  try {
    operation();
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ code: "ORDER_PENDING" });
}

describe("Routine Pro order intent", () => {
  it("reuses only the exact staged routine, goal, and active Gym session", () => {
    expect(() =>
      assertRoutineOrderInput(order, {
        gymSessionId,
        intent,
        stagedSession,
      }),
    ).not.toThrow();

    expectOrderPending(() =>
      assertRoutineOrderInput(order, {
        gymSessionId,
        intent: { ...intent, goal: "Build maximum muscle mass" },
        stagedSession,
      }),
    );
    expectOrderPending(() =>
      assertRoutineOrderInput(order, {
        gymSessionId: "00000000-0000-4000-8000-000000000099",
        intent,
        stagedSession,
      }),
    );
  });

  it("rejects any exercise-content change after the payment order exists", () => {
    expectOrderPending(() =>
      assertRoutineOrderInput(order, {
        gymSessionId,
        intent: {
          ...intent,
          routine: {
            ...routine,
            exercises: routine.exercises.map((exercise, index) =>
              index === 0
                ? { ...exercise, instructions: ["Use a different unconfirmed instruction."] }
                : exercise,
            ),
          },
        },
        stagedSession,
      }),
    );
    expectOrderPending(() =>
      assertRoutineOrderInput(order, {
        gymSessionId,
        intent: { ...intent, routine: { ...routine, durationMinutes: 30 } },
        stagedSession,
      }),
    );
  });

  it("never reuses an agent order for a site walkthrough intent or the reverse", () => {
    const staffSession = createGroundedSession({
      profile,
      equipment: equipmentCatalog,
      templateId: "low_impact_orientation",
      goal,
      createdVia: "site-ui",
      sessionId: "gym_routine_0123456789abcdef01234567",
    });
    const staffIntent = {
      initiatedVia: "site-ui",
      goal,
      templateId: "low_impact_orientation",
    } as const;
    const staffOrder = {
      initiatedVia: "site-ui",
      initialTemplateId: "low_impact_orientation",
      initialGoal: goal,
      gymSessionId,
    } as RoutineProOrder;

    expect(() =>
      assertRoutineOrderInput(staffOrder, {
        gymSessionId,
        intent: staffIntent,
        stagedSession: staffSession,
      }),
    ).not.toThrow();
    expectOrderPending(() =>
      assertRoutineOrderInput(order, {
        gymSessionId,
        intent: staffIntent,
        stagedSession: staffSession,
      }),
    );
    expectOrderPending(() =>
      assertRoutineOrderInput(staffOrder, { gymSessionId, intent, stagedSession }),
    );
  });
});
