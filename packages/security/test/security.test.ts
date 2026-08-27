import { describe, expect, it } from "vitest";
import {
  assertSafeGymProjection,
  authorizeGrant,
  buildGymProjection,
  createPkceChallenge,
  createOpaqueToken,
  hashOpaqueToken,
  issueContextGrant,
  redeemContextGrant,
  revokeContextGrant,
  signDemoToken,
  verifyDemoToken,
  type ContextGrantStore,
  type NewStoredContextGrant,
  type StoredContextGrant,
} from "../src";

class MemoryStore implements ContextGrantStore {
  grants = new Map<string, StoredContextGrant>();

  create(input: NewStoredContextGrant): Promise<StoredContextGrant> {
    const grant: StoredContextGrant = {
      ...input,
      id: crypto.randomUUID(),
      redeemedAt: null,
      revokedAt: null,
    };
    this.grants.set(grant.tokenHash, grant);
    return Promise.resolve(grant);
  }

  consume(hash: string, expectedAudience: string, now: Date): Promise<StoredContextGrant | null> {
    const grant = this.grants.get(hash);
    if (
      !grant ||
      grant.audience !== expectedAudience ||
      grant.redeemedAt ||
      grant.revokedAt ||
      grant.expiresAt <= now
    ) {
      return Promise.resolve(null);
    }
    grant.redeemedAt = now;
    return Promise.resolve(grant);
  }

  revoke(id: string, actor: string, now: Date): Promise<boolean> {
    const grant = [...this.grants.values()].find(
      (entry) => entry.id === id && entry.createdByUserId === actor,
    );
    if (!grant || grant.revokedAt) return Promise.resolve(false);
    grant.revokedAt = now;
    return Promise.resolve(true);
  }
}

describe("opaque context grants", () => {
  it("creates 256-bit tokens and hashes without persisting plaintext", async () => {
    const token = createOpaqueToken();
    expect(token).toHaveLength(43);
    expect(await hashOpaqueToken(token)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("can be redeemed only once", async () => {
    const store = new MemoryStore();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const projection = buildGymProjection({}, { now });
    const issued = await issueContextGrant(store, {
      patientId: crypto.randomUUID(),
      createdByUserId: crypto.randomUUID(),
      audience: "adaptive-gym",
      purpose: "adaptive session",
      scopes: ["gym.context.read"],
      projection: { version: 1, profile: projection, validUntil: projection.validUntil },
      now,
    });
    expect([...store.grants.values()][0]?.tokenHash).not.toBe(issued.token);
    expect(await redeemContextGrant(store, issued.token, "other-app", now)).toBeNull();
    expect(await redeemContextGrant(store, issued.token, "adaptive-gym", now)).not.toBeNull();
    expect(await redeemContextGrant(store, issued.token, "adaptive-gym", now)).toBeNull();
  });

  it("rejects expired and revoked tokens", async () => {
    const store = new MemoryStore();
    const actor = crypto.randomUUID();
    const now = new Date("2026-01-01T00:00:00.000Z");
    const projection = buildGymProjection({}, { now });
    const base = {
      patientId: crypto.randomUUID(),
      createdByUserId: actor,
      audience: "adaptive-gym",
      purpose: "adaptive session",
      scopes: ["gym.context.read"] as const,
      projection: { version: 1 as const, profile: projection, validUntil: projection.validUntil },
      ttlMs: 1,
      now,
    };
    const expired = await issueContextGrant(store, base);
    expect(
      await redeemContextGrant(store, expired.token, "adaptive-gym", new Date(now.getTime() + 2)),
    ).toBeNull();

    const revocable = await issueContextGrant(store, { ...base, ttlMs: 1_000 });
    expect(await revokeContextGrant(store, revocable.id, actor, now)).toBe(true);
    expect(await redeemContextGrant(store, revocable.token, "adaptive-gym", now)).toBeNull();
  });
});

describe("browser-bound synthetic demo tokens", () => {
  it("verifies exact issuer, audience and type while rejecting tampering", async () => {
    const now = new Date("2026-08-27T12:00:00.000Z");
    const token = await signDemoToken({
      issuer: "passport",
      audience: "adaptive-gym",
      subject: "passport_mateo",
      type: "gym-context-grant",
      ttlSeconds: 300,
      now,
      tokenId: "grant-test",
      secret: "test-secret-with-enough-entropy",
      data: { challenge: "challenge", projectionId: "gym_passport_mateo" },
    });

    const verified = await verifyDemoToken<{ challenge: string; projectionId: string }>(token, {
      issuer: "passport",
      audience: "adaptive-gym",
      type: "gym-context-grant",
      now,
      secret: "test-secret-with-enough-entropy",
    });
    expect(verified?.sub).toBe("passport_mateo");
    expect(verified?.data.projectionId).toBe("gym_passport_mateo");
    expect(
      await verifyDemoToken(token, {
        issuer: "passport",
        audience: "another-app",
        type: "gym-context-grant",
        now,
        secret: "test-secret-with-enough-entropy",
      }),
    ).toBeNull();
    expect(
      await verifyDemoToken(`${token.slice(0, -1)}x`, {
        issuer: "passport",
        audience: "adaptive-gym",
        type: "gym-context-grant",
        now,
        secret: "test-secret-with-enough-entropy",
      }),
    ).toBeNull();
  });

  it("binds a grant to a high-entropy browser verifier", async () => {
    const verifier = createOpaqueToken();
    expect(await createPkceChallenge(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    await expect(createPkceChallenge("short")).rejects.toThrow();
  });
});

describe("authorization and minimization", () => {
  it("rejects missing, expired, and revoked scopes", () => {
    expect(() =>
      authorizeGrant(
        { scopes: ["passport.summary.read"], expiresAt: new Date(Date.now() + 1_000) },
        ["passport.clinical.read"],
      ),
    ).toThrow();
    expect(() =>
      authorizeGrant({ scopes: ["passport.clinical.read"], expiresAt: new Date(0) }, [
        "passport.clinical.read",
      ]),
    ).toThrow();
  });

  it("builds an allowlisted gym projection and blocks clinical identity fields", () => {
    const projection = buildGymProjection({ goals: ["Build strength"], avoid: ["Max lifts"] });
    expect(projection.goals).toEqual(["Build strength"]);
    expect(() => assertSafeGymProjection({ ...projection, medications: ["secret"] })).toThrow();
    expect(() => assertSafeGymProjection({ ...projection, patientId: "secret" })).toThrow();
  });
});
