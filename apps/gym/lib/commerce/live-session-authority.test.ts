import { describe, expect, it, vi } from "vitest";
import type { LiveGymSessionAuthority } from "./live-session-authority";

const authority: LiveGymSessionAuthority = {
  anonymousSubjectId: "00000000-0000-4000-8000-000000000003",
  contextGrantId: "00000000-0000-4000-8000-000000000002",
  internalSessionId: "00000000-0000-4000-8000-000000000004",
  patientId: "00000000-0000-4000-8000-000000000001",
  projection: {
    version: 1,
    profile: {
      version: 1,
      purpose: "adaptive_gym_session",
      generatedAt: "2026-08-29T12:00:00.000Z",
      validUntil: "2026-08-29T12:05:00.000Z",
    },
    validUntil: "2026-08-29T12:05:00.000Z",
  },
  projectionValidUntil: "2026-08-29T12:05:00.000Z",
};

describe("transactional Gym session authority", () => {
  it("does not enter order creation when disconnect won the grant lock", async () => {
    const { withLockedLiveGymSessionAuthority } = await import("./live-session-authority");
    const query = vi.fn((statement: string) => {
      void statement;
      return Promise.resolve({ rowCount: 0, rows: [] });
    });
    const createOrder = vi.fn(() => Promise.resolve("created"));

    await expect(
      withLockedLiveGymSessionAuthority({ query } as never, authority, createOrder),
    ).rejects.toMatchObject({ code: "CONTEXT_EXPIRED" });
    expect(query).toHaveBeenCalledOnce();
    expect(String(query.mock.calls[0]?.[0])).toContain("FROM context_grants");
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("locks grant then session before entering a routine save", async () => {
    const { withLockedLiveGymSessionAuthority } = await import("./live-session-authority");
    const queries: string[] = [];
    const query = vi.fn((statement: string) => {
      queries.push(statement);
      return Promise.resolve({ rowCount: 1, rows: [{ id: "locked" }] });
    });
    const saveRoutine = vi.fn(() => Promise.resolve("saved"));

    await expect(
      withLockedLiveGymSessionAuthority({ query } as never, authority, saveRoutine),
    ).resolves.toBe("saved");
    expect(queries).toHaveLength(2);
    expect(queries[0]).toContain("FROM context_grants");
    expect(queries[0]).toContain("FOR UPDATE");
    expect(queries[0]).toContain("revoked_at IS NULL");
    expect(queries[0]).toContain("expires_at > now()");
    expect(queries[1]).toContain("FROM gym_sessions");
    expect(queries[1]).toContain("FOR UPDATE");
    expect(queries[1]).toContain("anonymous_subject_id = $3");
    expect(queries[1]).toContain("context_projection = $6::jsonb");
    expect(saveRoutine).toHaveBeenCalledOnce();
  });
});
