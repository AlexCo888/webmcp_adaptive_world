import { describe, expect, it } from "vitest";
import {
  canonicalizeJson,
  createRoutineProCapability,
  digestRoutineProCapability,
  sha256Hex,
  verifyRoutineProCapability,
  verifySha256Hex,
  type RoutineProCapabilityAuthority,
} from "../src";

const secret = "routine-pro-test-secret-that-is-at-least-thirty-two-bytes";
const authority = {
  amountMinor: 499,
  capabilityExpiresAt: new Date("2026-08-29T12:05:00.000Z"),
  capabilityVersion: 1,
  currency: "usd",
  productKey: "adaptive_world.routine_pro.v1",
  publicRef: "aw_order_01K3V7P2Q7XB6J8A9Z0M1N2P3Q",
} satisfies RoutineProCapabilityAuthority;

describe("canonical payment JSON", () => {
  it("sorts nested object keys while retaining array order", () => {
    expect(canonicalizeJson({ z: 1, a: { second: true, first: ["x", 2, null] } })).toBe(
      '{"a":{"first":["x",2,null],"second":true},"z":1}',
    );
    expect(canonicalizeJson({ a: 1, b: 2 })).toBe(canonicalizeJson({ b: 2, a: 1 }));
  });

  it("rejects values JSON would silently discard or coerce", () => {
    expect(() => canonicalizeJson({ missing: undefined })).toThrow();
    expect(() => canonicalizeJson(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => canonicalizeJson(new Date())).toThrow();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalizeJson(cyclic)).toThrow();
  });

  it("hashes and verifies canonical snapshots", async () => {
    const snapshot = canonicalizeJson({ mode: "payment", amount: 499 });
    const digest = await sha256Hex(snapshot);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    await expect(verifySha256Hex(snapshot, digest)).resolves.toBe(true);
    await expect(verifySha256Hex(`${snapshot} `, digest)).resolves.toBe(false);
  });
});

describe("Routine Pro order capabilities", () => {
  it("regenerates the identical hidden capability after a restart", async () => {
    const first = await createRoutineProCapability(authority, secret);
    const regenerated = await createRoutineProCapability(
      { ...authority, capabilityExpiresAt: authority.capabilityExpiresAt.toISOString() },
      secret,
    );
    expect(regenerated).toBe(first);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(await digestRoutineProCapability(first)).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("binds every immutable authority field, including exact expiry", async () => {
    const baseline = await createRoutineProCapability(authority, secret);
    const mutations: RoutineProCapabilityAuthority[] = [
      { ...authority, publicRef: `${authority.publicRef}X` },
      { ...authority, productKey: "adaptive_world.routine_pro.v2" },
      { ...authority, amountMinor: 500 },
      { ...authority, currency: "mxn" },
      { ...authority, capabilityVersion: 2 },
      { ...authority, capabilityExpiresAt: new Date("2026-08-29T12:05:00.001Z") },
    ];
    for (const mutation of mutations) {
      expect(await createRoutineProCapability(mutation, secret)).not.toBe(baseline);
    }
  });

  it("verifies before expiry and fails closed for tampering or expiry", async () => {
    const capability = await createRoutineProCapability(authority, secret);
    const tamperedCapability = `${capability.slice(0, -1)}${capability.endsWith("A") ? "B" : "A"}`;
    const beforeExpiry = new Date("2026-08-29T12:04:59.999Z");
    await expect(
      verifyRoutineProCapability(capability, authority, { now: beforeExpiry, secret }),
    ).resolves.toBe(true);
    await expect(
      verifyRoutineProCapability(
        capability,
        { ...authority, amountMinor: 500 },
        {
          now: beforeExpiry,
          secret,
        },
      ),
    ).resolves.toBe(false);
    await expect(
      verifyRoutineProCapability(capability, authority, {
        now: authority.capabilityExpiresAt,
        secret,
      }),
    ).resolves.toBe(false);
    await expect(
      verifyRoutineProCapability(tamperedCapability, authority, {
        now: beforeExpiry,
        secret,
      }),
    ).resolves.toBe(false);
  });

  it("rejects weak secrets", async () => {
    await expect(createRoutineProCapability(authority, "too-short")).rejects.toThrow();
  });
});
