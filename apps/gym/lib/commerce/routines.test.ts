import { canonicalizeJson, sha256Hex } from "@adaptive-world/security";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAndSavePersonalizedRoutine } from "./routines";

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

const plan = {
  id: "gym_routine_0123456789abcdef01234567",
  projectionId: "gym_projection_0123456789abcdef01234567",
  title: "Saved accessible equipment tour",
  goal: "Review accessible station setup",
  templateId: "accessible_equipment_tour",
  templateVersion: "1.0",
  createdVia: "site-ui" as const,
  catalogVersion: "test-v1",
  durationMinutes: 36,
  status: "draft" as const,
  exercises: [
    {
      equipmentId: "scifit_pro2_total_body",
      name: "SCIFIT PRO2",
      durationMinutes: 10,
      intensity: "easy" as const,
      instructions: ["Ask staff to confirm setup."],
      adaptationReason: "A verified accessible station.",
    },
  ],
  safetyNotes: [],
  decisionTrace: ["Loaded a saved template.", "Verified the saved station."],
  createdAt: "2026-08-29T12:00:00.000Z",
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
      generatedAt: "2026-08-29T12:00:00.000Z",
      validUntil: "2026-08-29T13:00:00.000Z",
    },
    validUntil: "2026-08-29T13:00:00.000Z",
  },
};

describe("saved Routine Pro reuse", () => {
  beforeEach(() => {
    mocks.authority.mockReset();
    mocks.query.mockReset();
    mocks.authority.mockImplementation(
      (_client: unknown, _authority: unknown, operation: () => unknown) => operation(),
    );
  });

  it("reactivates the saved plan without creating or charging for another routine", async () => {
    const canonicalPlan = canonicalizeJson(plan);
    const planHash = await sha256Hex(canonicalPlan);
    mocks.query.mockImplementation((statement: string) => {
      if (statement.includes("FROM entitlement_grants")) {
        return Promise.resolve({ rowCount: 1, rows: [{ id: "entitlement-1" }] });
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
        templateId: "accessible_equipment_tour",
        initiatedVia: "site-ui",
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
  });
});
