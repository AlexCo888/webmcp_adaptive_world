import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";
import type { LiveFeedbackWrite } from "./feedback-write";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/adaptive_world_test";

const write: LiveFeedbackWrite = {
  grantId: "00000000-0000-4000-8000-000000000001",
  internalSessionId: "00000000-0000-4000-8000-000000000002",
  anonymousSubjectId: "00000000-0000-4000-8000-000000000003",
  plan: {
    id: "gym_routine_0123456789abcdef01234567",
    projectionId: "gym_projection_0123456789abcdef01234567",
    title: "Test routine",
    goal: "Test the authority boundary",
    templateId: "first_visit_foundations",
    templateVersion: "1.0",
    generationMode: "staff_template",
    createdVia: "webmcp",
    catalogVersion: "test-v1",
    durationMinutes: 20,
    status: "draft",
    exercises: [
      {
        equipmentId: "bike-1",
        name: "Bike",
        intensity: "easy",
        instructions: ["Ask staff to confirm setup."],
        adaptationReason: "A deterministic test station.",
      },
    ],
    warmup: [],
    cooldown: [],
    safetyNotes: [],
    requiresExpertReview: false,
    decisionTrace: ["Loaded a test template.", "Verified the test station."],
    createdAt: "2026-08-29T12:00:00.000Z",
  },
  feedback: {
    sessionId: "gym_routine_0123456789abcdef01234567",
    perceivedEffort: 5,
    painDuringSession: 0,
    completedExerciseIds: ["bike-1"],
    submittedAt: "2026-08-29T12:20:00.000Z",
  },
};

describe("linearizable feedback write", () => {
  it("does not write when authority was revoked before the conditional statement", async () => {
    const { commitSessionFeedbackIfLive } = await import("./feedback-write");
    const execute = vi.fn(() => Promise.resolve({ rows: [] }));

    await expect(commitSessionFeedbackIfLive(write, execute as never)).resolves.toBe(false);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("commits feedback and completion through one authority-bound statement", async () => {
    const { commitSessionFeedbackIfLive } = await import("./feedback-write");
    const execute = vi.fn(() =>
      Promise.resolve({ rows: [{ gym_session_id: write.internalSessionId }] }),
    );

    await expect(commitSessionFeedbackIfLive(write, execute as never)).resolves.toBe(true);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("locks patient, grant, and session in the shared consequential-write order", async () => {
    const { commitSessionFeedbackIfLive } = await import("./feedback-write");
    let rendered = "";
    const execute = vi.fn((query: SQL) => {
      rendered = new PgDialect().sqlToQuery(query).sql.replace(/\s+/gu, " ").trim();
      return Promise.resolve({ rows: [] });
    });

    await commitSessionFeedbackIfLive(write, execute);

    const patientLock = rendered.indexOf("FOR UPDATE OF patient_row");
    const grantLock = rendered.indexOf("FOR UPDATE OF grant_row");
    const sessionLock = rendered.indexOf("FOR UPDATE OF session_row");
    expect(patientLock).toBeGreaterThan(-1);
    expect(grantLock).toBeGreaterThan(patientLock);
    expect(sessionLock).toBeGreaterThan(grantLock);

    const feedbackInsert = rendered.slice(
      rendered.indexOf("INSERT INTO session_feedback"),
      rendered.indexOf("), session_write AS"),
    );
    expect(feedbackInsert).toContain("created_at");
    expect(feedbackInsert).not.toContain("updated_at");
  });
});
