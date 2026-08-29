import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/adaptive_world_test";

describe("atomic Passport authority writes", () => {
  it("returns no guidance when the live grant vanished at the write boundary", async () => {
    const { commitClinicalGuidanceIfLive } = await import("./guidance-write");
    const execute = vi.fn(() => Promise.resolve({ rows: [] }));

    await expect(
      commitClinicalGuidanceIfLive(
        {
          doctorUserId: "00000000-0000-4000-8000-000000000001",
          passportId: "passport_test",
          guidance: "Continue the synthetic gradual warm-up.",
          expiresAt: new Date("2026-09-29T12:00:00.000Z"),
          requestId: "request-test",
        },
        execute as never,
      ),
    ).resolves.toBeNull();
    expect(execute).toHaveBeenCalledOnce();
  });

  it("locks the patient before guidance authority rows", async () => {
    const { commitClinicalGuidanceIfLive } = await import("./guidance-write");
    let rendered = "";
    const execute = vi.fn((query: SQL) => {
      rendered = new PgDialect().sqlToQuery(query).sql.replace(/\s+/gu, " ").trim();
      return Promise.resolve({ rows: [] });
    });

    await commitClinicalGuidanceIfLive(
      {
        doctorUserId: "00000000-0000-4000-8000-000000000002",
        passportId: "passport_test",
        guidance: "Continue the synthetic gradual warm-up.",
        expiresAt: new Date("2026-09-29T12:00:00.000Z"),
        requestId: "request-test",
      },
      execute,
    );

    const patientLock = rendered.indexOf("FOR UPDATE OF patient_row");
    const authorityLocks = rendered.indexOf("FOR UPDATE OF grant_row, relationship_row");
    expect(patientLock).toBeGreaterThan(-1);
    expect(authorityLocks).toBeGreaterThan(patientLock);
  });

  it("fails the canonical grant operation as one statement", async () => {
    const { upsertCanonicalDoctorGrant } = await import("./access-grant-write");
    const execute = vi.fn(() => Promise.reject(new Error("audit insert failed")));

    await expect(
      upsertCanonicalDoctorGrant(
        {
          ownerUserId: "00000000-0000-4000-8000-000000000001",
          scopes: ["passport.summary.read"],
          expiresAt: new Date("2026-09-29T12:00:00.000Z"),
          requestId: "request-test",
        },
        execute as never,
      ),
    ).rejects.toThrow("audit insert failed");
    expect(execute).toHaveBeenCalledOnce();
  });

  it("reports every equivalent live grant revoked by the canonical statement", async () => {
    const { revokeCanonicalDoctorGrant } = await import("./access-grant-write");
    const execute = vi.fn(() =>
      Promise.resolve({
        rows: [{ grant_id: "00000000-0000-4000-8000-000000000004", revoked_count: 2 }],
      }),
    );

    await expect(
      revokeCanonicalDoctorGrant(
        {
          ownerUserId: "00000000-0000-4000-8000-000000000001",
          grantId: "00000000-0000-4000-8000-000000000004",
          requestId: "request-test",
        },
        execute as never,
      ),
    ).resolves.toEqual({
      grantId: "00000000-0000-4000-8000-000000000004",
      revokedCount: 2,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("locks the patient before the grant during canonical revocation", async () => {
    const { revokeCanonicalDoctorGrant } = await import("./access-grant-write");
    let rendered = "";
    const execute = vi.fn((query: SQL) => {
      rendered = new PgDialect().sqlToQuery(query).sql.replace(/\s+/gu, " ").trim();
      return Promise.resolve({ rows: [] });
    });

    await revokeCanonicalDoctorGrant(
      {
        ownerUserId: "00000000-0000-4000-8000-000000000001",
        grantId: "00000000-0000-4000-8000-000000000004",
        requestId: "request-test",
      },
      execute,
    );

    const patientLock = rendered.indexOf("FOR UPDATE OF patient_row");
    const grantLock = rendered.indexOf("FOR UPDATE OF grant_row");
    expect(patientLock).toBeGreaterThan(-1);
    expect(grantLock).toBeGreaterThan(patientLock);
  });
});
