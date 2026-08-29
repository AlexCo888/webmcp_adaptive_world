import assert from "node:assert/strict";

import { it as test } from "vitest";

import { Store } from "mppx/server";
import { createRoutineProCapability, digestRoutineProCapability } from "@adaptive-world/security";

import {
  digestOrderCapability,
  orderCapabilityAuthority,
  regenerateOrderCapability,
  verifyOrderCapability,
} from "./capability";
import { createMppxTempoMerchantProvider } from "./merchant";
import {
  buildTempoChargeOptions,
  digestTempoPaymentSnapshot,
  validateTempoChallenge,
} from "./snapshot";
import { mppTestConfig, mppTestSnapshot, TEST_CAPABILITY_SECRET } from "./test-fixtures";

test("persisted expiry produces an identical challenge and capability across time", async () => {
  const config = mppTestConfig();
  const snapshot = mppTestSnapshot();
  const provider = createMppxTempoMerchantProvider(config, Store.memory());

  const earlyChallenge = await provider.createChallenge(buildTempoChargeOptions(snapshot));
  const laterChallenge = await provider.createChallenge(buildTempoChargeOptions(snapshot));
  assert.deepEqual(laterChallenge, earlyChallenge);

  const early = new Date("2026-08-29T12:00:00.000Z");
  const later = new Date("2098-08-29T12:00:00.000Z");
  const earlySafe = validateTempoChallenge(earlyChallenge, snapshot, early);
  const laterSafe = validateTempoChallenge(laterChallenge, snapshot, later);
  assert.deepEqual(laterSafe, earlySafe);
  assert.equal(earlySafe.expiresAt, snapshot.capabilityExpiresAt);

  const firstCapability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  const secondCapability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  assert.equal(secondCapability, firstCapability);
  const capabilityDigest = await digestOrderCapability(firstCapability);
  const sharedCapability = await createRoutineProCapability(
    orderCapabilityAuthority(snapshot),
    TEST_CAPABILITY_SECRET,
  );
  assert.equal(firstCapability, sharedCapability);
  assert.equal(capabilityDigest, await digestRoutineProCapability(sharedCapability));
  assert.deepEqual(
    await verifyOrderCapability({
      capability: firstCapability,
      capabilityDigest,
      capabilitySecret: TEST_CAPABILITY_SECRET,
      now: early,
      snapshot,
    }),
    snapshot,
  );
  assert.deepEqual(
    await verifyOrderCapability({
      capability: secondCapability,
      capabilityDigest,
      capabilitySecret: TEST_CAPABILITY_SECRET,
      now: later,
      snapshot,
    }),
    snapshot,
  );
  assert.equal(digestTempoPaymentSnapshot(snapshot), earlySafe.snapshotDigest);
});

test("the persisted expiry does not rotate after expiration", async () => {
  const snapshot = mppTestSnapshot();
  const capability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  const digest = await digestOrderCapability(capability);

  await assert.rejects(
    async () =>
      verifyOrderCapability({
        capability,
        capabilityDigest: digest,
        capabilitySecret: TEST_CAPABILITY_SECRET,
        now: new Date("2100-01-01T00:00:00.000Z"),
        snapshot,
      }),
    { message: "The agent payment was not completed." },
  );
  assert.equal(await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET), capability);
});
