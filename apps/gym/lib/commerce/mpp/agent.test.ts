import assert from "node:assert/strict";

import { it as test } from "vitest";

import { Receipt } from "mppx";
import { Store } from "mppx/server";

import type { TempoAgentClientPort, TempoPreparedPaymentPort } from "./agent";
import { createTempoAgentPaymentAdapter } from "./agent";
import { digestOrderCapability, regenerateOrderCapability } from "./capability";
import { MPP_PAYMENT_CREDENTIAL_HEADER, MPP_RECEIPT_HEADER } from "./constants";
import { createMppxTempoMerchantProvider } from "./merchant";
import { buildTempoChargeOptions } from "./snapshot";
import { mppTestConfig, mppTestSnapshot, TEST_CAPABILITY_SECRET } from "./test-fixtures";

async function protocolChallenge(): Promise<unknown> {
  const config = mppTestConfig();
  const merchant = createMppxTempoMerchantProvider(config, Store.memory());
  return merchant.createChallenge(buildTempoChargeOptions(mppTestSnapshot()));
}

test("pull credential is not attached or submitted before markSubmitted resolves", async () => {
  const config = mppTestConfig();
  const snapshot = mppTestSnapshot();
  const challenge = await protocolChallenge();
  const events: string[] = [];
  const credential = "credential-private-value";
  const rawReceipt = Receipt.serialize({
    method: "tempo",
    reference: "0xreceipt-private-value",
    status: "success",
    timestamp: "2026-08-29T12:00:01.000Z",
  });
  let fetchCount = 0;
  const fetchSignals: AbortSignal[] = [];

  const preparedPort: TempoPreparedPaymentPort = {
    challenge,
    createCredential() {
      events.push("sign");
      return Promise.resolve(credential);
    },
    setCredential(request, signedCredential) {
      events.push("attach");
      assert.equal(signedCredential, credential);
      const headers = new Headers(request.headers);
      headers.set(MPP_PAYMENT_CREDENTIAL_HEADER, signedCredential);
      return { ...request, headers };
    },
  };
  const client: TempoAgentClientPort = {
    preparePayment() {
      events.push("prepare");
      return Promise.resolve(preparedPort);
    },
    rawFetch(_input, init) {
      fetchCount += 1;
      assert.ok(init?.signal instanceof AbortSignal);
      fetchSignals.push(init.signal);
      const headers = new Headers(init?.headers);
      if (fetchCount === 1) {
        events.push("challenge-fetch");
        assert.equal(headers.has(MPP_PAYMENT_CREDENTIAL_HEADER), false);
        return Promise.resolve(new Response(null, { status: 402 }));
      }
      events.push("credential-fetch");
      assert.equal(headers.get(MPP_PAYMENT_CREDENTIAL_HEADER), credential);
      return Promise.resolve(
        new Response(null, {
          headers: { [MPP_RECEIPT_HEADER]: rawReceipt },
          status: 200,
        }),
      );
    },
  };

  const capability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  const adapter = createTempoAgentPaymentAdapter({ client, config });
  const prepared = await adapter.prepare({
    capability,
    capabilityDigest: await digestOrderCapability(capability),
    now: new Date("2026-08-29T12:00:00.000Z"),
    snapshot,
  });
  const signed = await prepared.sign();

  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  let finishMark!: () => void;
  const markGate = new Promise<void>((resolve) => {
    finishMark = resolve;
  });
  const submission = signed.submitAfterMarkSubmitted({
    async markSubmitted() {
      events.push("mark-started");
      markStarted();
      await markGate;
      events.push("mark-finished");
    },
  });

  await started;
  await Promise.resolve();
  assert.equal(events.includes("attach"), false);
  assert.equal(events.includes("credential-fetch"), false);
  assert.equal(fetchCount, 1);

  finishMark();
  const result = await submission;
  assert.deepEqual(events, [
    "challenge-fetch",
    "prepare",
    "sign",
    "mark-started",
    "mark-finished",
    "attach",
    "credential-fetch",
  ]);
  assert.equal(result.outcome, "verified");
  assert.equal(fetchSignals.length, 2);
  assert.notEqual(fetchSignals[0], fetchSignals[1]);

  const safeResult = JSON.stringify(result);
  assert.equal(safeResult.includes(credential), false);
  assert.equal(safeResult.includes(rawReceipt), false);
  assert.equal(safeResult.includes(config.tempoRecipient), false);
  assert.equal(safeResult.includes(capability), false);
});

test("concurrent callers attach and send only the credential that wins the durable submission claim", async () => {
  const config = mppTestConfig();
  const snapshot = mppTestSnapshot();
  const challenge = await protocolChallenge();
  const capability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  const capabilityDigest = await digestOrderCapability(capability);
  const rawReceipt = Receipt.serialize({
    externalId: snapshot.publicRef,
    method: "tempo",
    reference: "0xsingle-submission",
    status: "success",
    timestamp: "2026-08-29T12:00:01.000Z",
  });
  const attachedCredentials: string[] = [];
  const sentCredentials: string[] = [];

  function clientFor(credential: string): TempoAgentClientPort {
    const preparedPort: TempoPreparedPaymentPort = {
      challenge,
      createCredential: () => Promise.resolve(credential),
      setCredential(request, signedCredential) {
        attachedCredentials.push(signedCredential);
        const headers = new Headers(request.headers);
        headers.set(MPP_PAYMENT_CREDENTIAL_HEADER, signedCredential);
        return { ...request, headers };
      },
    };
    return {
      preparePayment: () => Promise.resolve(preparedPort),
      rawFetch(_input, init) {
        const credentialHeader = new Headers(init?.headers).get(MPP_PAYMENT_CREDENTIAL_HEADER);
        if (!credentialHeader) return Promise.resolve(new Response(null, { status: 402 }));
        sentCredentials.push(credentialHeader);
        return Promise.resolve(
          new Response(null, {
            headers: { [MPP_RECEIPT_HEADER]: rawReceipt },
            status: 200,
          }),
        );
      },
    };
  }

  const prepared = await Promise.all(
    ["credential-one", "credential-two"].map(async (credential) => {
      const adapter = createTempoAgentPaymentAdapter({ client: clientFor(credential), config });
      return adapter.prepare({
        capability,
        capabilityDigest,
        now: new Date("2026-08-29T12:00:00.000Z"),
        snapshot,
      });
    }),
  );
  const signed = await Promise.all(prepared.map((payment) => payment.sign()));

  let arrivals = 0;
  let releaseClaims!: () => void;
  const claimsReady = new Promise<void>((resolve) => {
    releaseClaims = resolve;
  });
  let claimed = false;
  async function claimSubmission(): Promise<void> {
    arrivals += 1;
    if (arrivals === signed.length) releaseClaims();
    await claimsReady;
    if (claimed) throw new Error("Submission already claimed");
    claimed = true;
  }

  const outcomes = await Promise.allSettled(
    signed.map((payment) => payment.submitAfterMarkSubmitted({ markSubmitted: claimSubmission })),
  );

  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
  assert.equal(attachedCredentials.length, 1);
  assert.deepEqual(sentCredentials, attachedCredentials);
});

test("a local durable-mark error is preserved and no credential is attached or sent", async () => {
  const config = mppTestConfig();
  const snapshot = mppTestSnapshot();
  const challenge = await protocolChallenge();
  const capability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  const markError = Object.assign(new Error("database transition failed"), { code: "42P08" });
  let attached = false;
  let fetchCount = 0;
  const client: TempoAgentClientPort = {
    preparePayment: () =>
      Promise.resolve({
        challenge,
        createCredential: () => Promise.resolve("credential-private-value"),
        setCredential(request) {
          attached = true;
          return request;
        },
      }),
    rawFetch() {
      fetchCount += 1;
      return Promise.resolve(new Response(null, { status: 402 }));
    },
  };
  const adapter = createTempoAgentPaymentAdapter({ client, config });
  const prepared = await adapter.prepare({
    capability,
    capabilityDigest: await digestOrderCapability(capability),
    now: new Date("2026-08-29T12:00:00.000Z"),
    snapshot,
  });
  const signed = await prepared.sign();

  await assert.rejects(
    signed.submitAfterMarkSubmitted({
      markSubmitted: () => Promise.reject(markError),
    }),
    (error) => error === markError,
  );
  assert.equal(attached, false);
  assert.equal(fetchCount, 1);
});

test("single-recipient and chain mismatches fail before signing", async () => {
  const config = mppTestConfig();
  const snapshot = mppTestSnapshot();
  const baseChallenge = (await protocolChallenge()) as {
    request: { methodDetails: { chainId: number }; recipient: string };
  };
  const capability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  const capabilityDigest = await digestOrderCapability(capability);

  for (const challenge of [
    {
      ...baseChallenge,
      request: {
        ...baseChallenge.request,
        recipient: "0x2222222222222222222222222222222222222222",
      },
    },
    {
      ...baseChallenge,
      request: {
        ...baseChallenge.request,
        methodDetails: { ...baseChallenge.request.methodDetails, chainId: 1 },
      },
    },
  ]) {
    let signed = false;
    const client: TempoAgentClientPort = {
      preparePayment() {
        return Promise.resolve({
          challenge,
          createCredential() {
            signed = true;
            return Promise.resolve("must-not-be-created");
          },
          setCredential(request) {
            return request;
          },
        });
      },
      rawFetch() {
        return Promise.resolve(new Response(null, { status: 402 }));
      },
    };
    const adapter = createTempoAgentPaymentAdapter({ client, config });
    await assert.rejects(
      adapter.prepare({
        capability,
        capabilityDigest,
        now: new Date("2026-08-29T12:00:00.000Z"),
        snapshot,
      }),
      { message: "The payment request could not be validated." },
    );
    assert.equal(signed, false);
  }
});

test("merchant fetches are aborted at the bounded outbound deadline", async () => {
  const config = mppTestConfig();
  const snapshot = mppTestSnapshot();
  const capability = await regenerateOrderCapability(snapshot, TEST_CAPABILITY_SECRET);
  let receivedSignal: AbortSignal | null = null;
  const client: TempoAgentClientPort = {
    preparePayment() {
      throw new TypeError("A challenge must not arrive after timeout");
    },
    rawFetch(_input, init) {
      receivedSignal = init?.signal ?? null;
      return new Promise<Response>((_resolve, reject) => {
        receivedSignal?.addEventListener("abort", () => reject(new Error("Request aborted")), {
          once: true,
        });
      });
    },
  };
  const adapter = createTempoAgentPaymentAdapter({
    client,
    config,
    outboundTimeoutMs: 5,
  });

  await assert.rejects(
    adapter.prepare({
      capability,
      capabilityDigest: await digestOrderCapability(capability),
      now: new Date("2026-08-29T12:00:00.000Z"),
      snapshot,
    }),
    { message: "Agent payment is unavailable." },
  );
  assert.equal((receivedSignal as AbortSignal | null)?.aborted, true);
});
