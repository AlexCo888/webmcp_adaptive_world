import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { prepareLockedGymContextGrant } from "@/lib/context-grant-preparation";
import { testPassport } from "@/lib/test-passport-fixture";
import { ContextGrantInputSchema, resolveContextGrantTiming } from "./route";

describe("Gym context grant duration", () => {
  it("defaults to five minutes and preserves accepted values", () => {
    expect(ContextGrantInputSchema.parse({})).toEqual({ expiresInMinutes: 5 });
    expect(ContextGrantInputSchema.parse({ expiresInMinutes: 1 })).toEqual({ expiresInMinutes: 1 });
    expect(ContextGrantInputSchema.parse({ expiresInMinutes: 10 })).toEqual({
      expiresInMinutes: 10,
    });
  });

  it("rejects values outside 1-15 minutes and unknown fields", () => {
    expect(ContextGrantInputSchema.safeParse({ expiresInMinutes: 0 }).success).toBe(false);
    expect(ContextGrantInputSchema.safeParse({ expiresInMinutes: 16 }).success).toBe(false);
    expect(ContextGrantInputSchema.safeParse({ expiresInMinutes: 1.5 }).success).toBe(false);
    expect(
      ContextGrantInputSchema.safeParse({ expiresInMinutes: 5, scopes: ["anything"] }).success,
    ).toBe(false);
  });

  it("derives one exact persisted and reported expiry from the accepted duration", () => {
    const issuedAt = new Date("2026-08-29T09:00:00.000Z");
    const timing = resolveContextGrantTiming(10, issuedAt);
    expect(timing.ttlMs).toBe(600_000);
    expect(timing.expiresAt.toISOString()).toBe("2026-08-29T09:10:00.000Z");
  });

  it("locks the patient before deriving the grant from the authoritative profile", async () => {
    let rendered = "";
    const lockedProfile = {
      ...testPassport,
      functional: {
        ...testPassport.functional,
        goals: ["Use only the locked database profile"],
      },
    };
    const execute = (query: SQL) => {
      rendered = new PgDialect().sqlToQuery(query).sql.replace(/\s+/gu, " ").trim();
      return Promise.resolve({
        rows: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            profile: lockedProfile,
          },
        ],
      });
    };

    const preparation = await prepareLockedGymContextGrant(
      {
        actorId: "00000000-0000-4000-8000-000000000001",
        expiresInMinutes: 5,
      },
      execute,
    );

    expect(rendered).toContain("FROM patients AS patient_row");
    expect(rendered).toContain("FOR UPDATE OF patient_row");
    expect(preparation.kind).toBe("ready");
    if (preparation.kind !== "ready") throw new Error("Expected a locked preparation");
    expect(preparation.patientId).toBe("10000000-0000-4000-8000-000000000001");
    expect(preparation.profile.goals).toEqual(["Use only the locked database profile"]);
  });
});
