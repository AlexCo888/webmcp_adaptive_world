import assert from "node:assert/strict";

import { it as test } from "vitest";

import { Receipt } from "mppx";
import { Store } from "mppx/server";

import { createTempoAgentPaymentAdapter } from "./agent";
import { digestOrderCapability, regenerateOrderCapability } from "./capability";
import { createTempoMerchantAdapter, type TempoMerchantProviderPort } from "./merchant";
import { mppTestConfig, mppTestSnapshot, TEST_CAPABILITY_SECRET } from "./test-fixtures";

test("merchant issues a standards-based 402 without exposing capability material", async () => {
  const config = mppTestConfig();
  const snapshot = mppTestSnapshot();
  const capability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  const capabilityDigest = await digestOrderCapability(capability);
  const merchant = createTempoMerchantAdapter({ config, store: Store.memory() });

  const result = await merchant.handle({
    capabilityDigest,
    now: new Date("2026-08-29T12:00:00.000Z"),
    request: new Request(config.merchantUrl, {
      headers: { authorization: `Bearer ${capability}` },
      method: "POST",
    }),
    snapshot,
  });

  assert.equal(result.status, 402);
  assert.equal(result.protocolResponse.status, 402);
  assert.match(result.protocolResponse.headers.get("www-authenticate") ?? "", /^Payment /u);
  assert.equal(result.safe.outcome, "payment_required");
  assert.match(result.safe.challenge.challengeId, /^[A-Za-z0-9_-]{43}$/u);
  const repeated = await merchant.createSafeChallenge({
    now: new Date("2026-08-29T12:00:00.000Z"),
    snapshot,
  });
  assert.equal(repeated.challengeId, result.safe.challenge.challengeId);

  const safeResult = JSON.stringify(result.safe);
  assert.equal(safeResult.includes(capability), false);
  assert.equal(safeResult.includes(config.tempoCurrency), false);
  assert.equal(safeResult.includes(config.tempoRecipient), false);

  const agent = createTempoAgentPaymentAdapter({
    config,
    fetch: () => Promise.resolve(result.protocolResponse.clone()),
  });
  const prepared = await agent.prepare({
    capability,
    capabilityDigest,
    now: new Date("2026-08-29T12:00:00.000Z"),
    snapshot,
  });
  assert.equal(prepared.challenge.orderRef, snapshot.publicRef);
});

test("merchant exposes the validated provider settlement timestamp as durable evidence", async () => {
  const config = mppTestConfig();
  const snapshot = mppTestSnapshot();
  const capability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  const capabilityDigest = await digestOrderCapability(capability);
  const rawReceipt = Receipt.serialize({
    externalId: snapshot.publicRef,
    method: "tempo",
    reference: "0xprovider-payment-reference",
    status: "success",
    timestamp: "2026-08-29T12:00:01.000Z",
  });
  const provider: TempoMerchantProviderPort = {
    createChallenge: () => Promise.reject(new TypeError("Not used")),
    handle: () =>
      Promise.resolve({
        status: 200,
        withReceipt(response = new Response(null, { status: 204 })) {
          const headers = new Headers(response.headers);
          headers.set("Payment-Receipt", rawReceipt);
          return new Response(response.body, { headers, status: response.status });
        },
      }),
  };
  const merchant = createTempoMerchantAdapter({ config, provider, store: Store.memory() });
  const result = await merchant.handle({
    capabilityDigest,
    now: new Date("2026-08-29T12:00:00.000Z"),
    request: new Request(config.merchantUrl, {
      headers: { authorization: `Bearer ${capability}` },
      method: "POST",
    }),
    snapshot,
  });

  assert.equal(result.status, 200);
  assert.equal(result.evidence.paidAt.toISOString(), "2026-08-29T12:00:01.000Z");
  assert.equal(result.evidence.providerPaymentRef, "0xprovider-payment-reference");
  assert.equal(result.safe.paidAt, "2026-08-29T12:00:01.000Z");
});
