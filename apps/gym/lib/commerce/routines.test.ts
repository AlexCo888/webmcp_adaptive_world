import type { AgentGeneratedRoutineInput } from "@adaptive-world/contracts";
import { canonicalizeJson, sha256Hex } from "@adaptive-world/security";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAndSavePersonalizedRoutine, validatePersonalizedRoutineRequest } from "./routines";

const mocks = vi.hoisted(() => ({
  authority: vi.fn(),
  query: vi.fn(),
}));

vi.mock("./database", () => ({
  withCommerceTransaction: (operation: (client: { query: typeof mocks.query }) => unknown) =>
    operation({ query: mocks.query }),
}));

vi.mock("./live-session-authority", () => ({
  withLockedLiveGymSessionAuthority: (
    client: unknown,
    authority: unknown,
    operation: () => unknown,
  ): unknown => mocks.authority(client, authority, operation) as unknown,
}));

const goal = "Create a cautious routine while weight-bearing clearance remains undocumented";
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
const active = {
  subjectId: "00000000-0000-4000-8000-000000000003",
  row: {
    id: "00000000-0000-4000-8000-000000000004",
    patientId: "00000000-0000-4000-8000-000000000001",
  },
  grant: { id: "00000000-0000-4000-8000-000000000002" },
  stored: {
    version: 1,
    profile: {
      version: 1,
      purpose: "adaptive_gym_session",
      generatedAt: "2026-09-01T12:00:00.000Z",
      validUntil: "2026-09-01T13:00:00.000Z",
      goals: ["Return gradually to regular activity"],
      experienceLevel: "beginner",
      preferredSessionMinutes: { min: 30, max: 40 },
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
    },
    validUntil: "2026-09-01T13:00:00.000Z",
  },
};

function buildPlan() {
  return validatePersonalizedRoutineRequest({
    active: active as never,
    goal,
    routine,
  }).session;
}

describe("saved agent-generated Routine Pro reuse", () => {
  beforeEach(() => {
    mocks.authority.mockReset();
    mocks.query.mockReset();
    mocks.authority.mockImplementation(
      (_client: unknown, _authority: unknown, operation: () => unknown) => operation(),
    );
  });

  it("reactivates the exact saved plan without creating or charging for another routine", async () => {
    const plan = buildPlan();
    const canonicalPlan = canonicalizeJson(plan);
    const planHash = await sha256Hex(canonicalPlan);
    mocks.query.mockImplementation((statement: string) => {
      if (statement.includes("FROM entitlement_grants")) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: "entitlement-1" }] });
      }
      if (statement.includes("SELECT plan FROM gym_sessions")) {
        return Promise.resolve({ rowCount: 1, rows: [{ plan }] });
      }
      if (statement.includes("FROM saved_routines")) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ id: "saved-routine-1", plan, plan_hash: planHash }],
        });
      }
      return Promise.resolve({ rowCount: 1, rows: [{ id: active.row.id }] });
    });

    await expect(
      createAndSavePersonalizedRoutine({
        active: active as never,
        goal,
        routine,
      }),
    ).resolves.toEqual({
      session: plan,
      savedRoutineRef: "saved-routine-1",
      reused: true,
    });

    const statements = mocks.query.mock.calls.map(([statement]) => String(statement));
    expect(statements.filter((statement) => statement.includes("UPDATE gym_sessions"))).toEqual([
      "UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1",
    ]);
    expect(mocks.query).toHaveBeenCalledWith(
      "UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1",
      [active.row.id, canonicalPlan],
    );
    expect(statements.some((statement) => statement.includes("INSERT INTO saved_routines"))).toBe(
      false,
    );
    expect(statements.some((statement) => statement.includes("commerce_orders"))).toBe(false);
  });

  it("does not reuse a saved routine under a different confirmed goal", async () => {
    const plan = buildPlan();
    const canonicalPlan = canonicalizeJson(plan);
    const planHash = await sha256Hex(canonicalPlan);
    mocks.query.mockImplementation((statement: string) => {
      if (statement.includes("FROM entitlement_grants")) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: "entitlement-1" }] });
      }
      if (statement.includes("SELECT plan FROM gym_sessions")) {
        return Promise.resolve({ rowCount: 1, rows: [{ plan }] });
      }
      if (statement.includes("FROM saved_routines")) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ id: "saved-routine-1", plan, plan_hash: planHash }],
        });
      }
      return Promise.resolve({ rowCount: 1, rows: [{ id: active.row.id }] });
    });

    await expect(
      createAndSavePersonalizedRoutine({
        active: active as never,
        goal: "Train for a different outcome",
        routine,
      }),
    ).rejects.toMatchObject({ code: "ROUTINE_CONFLICT" });

    const statements = mocks.query.mock.calls.map(([statement]) => String(statement));
    expect(statements.some((statement) => statement.includes("UPDATE gym_sessions"))).toBe(false);
    expect(statements.some((statement) => statement.includes("INSERT INTO saved_routines"))).toBe(
      false,
    );
  });

  it("does not reuse a saved routine when any confirmed instruction changes", async () => {
    const plan = buildPlan();
    const canonicalPlan = canonicalizeJson(plan);
    const planHash = await sha256Hex(canonicalPlan);
    mocks.query.mockImplementation((statement: string) => {
      if (statement.includes("FROM entitlement_grants")) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: "entitlement-1" }] });
      }
      if (statement.includes("SELECT plan FROM gym_sessions")) {
        return Promise.resolve({ rowCount: 1, rows: [{ plan }] });
      }
      if (statement.includes("FROM saved_routines")) {
        return Promise.resolve({
          rowCount: 1,
          rows: [{ id: "saved-routine-1", plan, plan_hash: planHash }],
        });
      }
      return Promise.resolve({ rowCount: 1, rows: [{ id: active.row.id }] });
    });

    await expect(
      createAndSavePersonalizedRoutine({
        active: active as never,
        goal,
        routine: {
          ...routine,
          exercises: routine.exercises.map((exercise, index) =>
            index === 0
              ? { ...exercise, instructions: ["Use an unconfirmed replacement instruction."] }
              : exercise,
          ),
        },
      }),
    ).rejects.toMatchObject({ code: "ROUTINE_CONFLICT" });
  });
});
