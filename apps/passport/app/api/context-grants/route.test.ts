import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  prepareGymContextGrant,
  prepareLockedGymContextGrant,
} from "@/lib/context-grant-preparation";
import { testPassport } from "@/lib/test-passport-fixture";
import { ContextGrantInputSchema, resolveContextGrantTiming } from "./route";

describe("Gym context grant duration", () => {
  const preparationToken = "p".repeat(80);
  const goal = "Support lifelong health without bodybuilding-style muscle gain";

  it("defaults to twenty minutes and preserves accepted values", () => {
    expect(ContextGrantInputSchema.parse({ goal, preparationToken })).toEqual({
      goal,
      expiresInMinutes: 20,
      preparationToken,
    });
    expect(ContextGrantInputSchema.parse({ goal, expiresInMinutes: 1, preparationToken })).toEqual({
      goal,
      expiresInMinutes: 1,
      preparationToken,
    });
    expect(ContextGrantInputSchema.parse({ goal, expiresInMinutes: 20, preparationToken })).toEqual(
      {
        goal,
        expiresInMinutes: 20,
        preparationToken,
      },
    );
  });

  it("rejects values outside 1-20 minutes and unknown fields", () => {
    expect(ContextGrantInputSchema.safeParse({ goal, expiresInMinutes: 5 }).success).toBe(false);
    expect(ContextGrantInputSchema.safeParse({ preparationToken }).success).toBe(false);
    expect(
      ContextGrantInputSchema.safeParse({ goal, expiresInMinutes: 0, preparationToken }).success,
    ).toBe(false);
    expect(
      ContextGrantInputSchema.safeParse({ goal, expiresInMinutes: 21, preparationToken }).success,
    ).toBe(false);
    expect(
      ContextGrantInputSchema.safeParse({ goal, expiresInMinutes: 1.5, preparationToken }).success,
    ).toBe(false);
    expect(
      ContextGrantInputSchema.safeParse({
        expiresInMinutes: 5,
        goal,
        preparationToken,
        scopes: ["anything"],
      }).success,
    ).toBe(false);
  });

  it("derives one exact persisted and reported expiry from the accepted duration", () => {
    const issuedAt = new Date("2026-08-29T09:00:00.000Z");
    const timing = resolveContextGrantTiming(20, issuedAt);
    expect(timing.ttlMs).toBe(1_200_000);
    expect(timing.expiresAt.toISOString()).toBe("2026-08-29T09:20:00.000Z");
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
        requestedRoutineGoal: goal,
        expiresInMinutes: 5,
      },
      execute,
    );

    expect(rendered).toContain("FROM patients AS patient_row");
    expect(rendered).toContain("FOR UPDATE OF patient_row");
    expect(preparation.kind).toBe("ready");
    if (preparation.kind !== "ready") throw new Error("Expected a locked preparation");
    expect(preparation.patientId).toBe("10000000-0000-4000-8000-000000000001");
    expect(preparation.profile.requestedRoutineGoal).toBe(goal);
    expect(preparation.profile.goals).toEqual(["Use only the locked database profile"]);
    expect(preparation.purpose).toContain(goal);
  });

  it("rejects issuing a prepared grant when the requested goal changes after approval", async () => {
    const actorId = "00000000-0000-4000-8000-000000000001";
    const prepared = await prepareGymContextGrant({
      passport: testPassport,
      actorId,
      requestedRoutineGoal: goal,
      expiresInMinutes: 5,
    });
    const execute = () =>
      Promise.resolve({
        rows: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            profile: testPassport,
          },
        ],
      });

    const changed = await prepareLockedGymContextGrant(
      {
        actorId,
        requestedRoutineGoal: "Train for maximum bodybuilding muscle gain",
        expiresInMinutes: 5,
        preparationToken: prepared.preparationToken,
      },
      execute,
    );

    expect(changed).toEqual({ kind: "invalid_preparation" });
  });
});
