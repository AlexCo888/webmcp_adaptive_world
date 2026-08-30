import { createHash } from "node:crypto";

import { Receipt } from "mppx";
import { Mppx, tempo } from "mppx/client";
import { privateKeyToAccount } from "viem/accounts";

import { verifyOrderCapability } from "./capability";
import {
  MPP_OUTBOUND_TIMEOUT_MS,
  MPP_PAYMENT_CREDENTIAL_HEADER,
  MPP_RECEIPT_HEADER,
  TEMPO_TESTNET_CHAIN_ID,
} from "./constants";
import type { EnabledMppProviderConfig, MppProviderConfig } from "./config";
import { requireEnabledMppProvider } from "./config";
import { MppAdapterError } from "./errors";
import { receiptMatchesOrderReference } from "./receipt-order";
import {
  assertSnapshotMatchesProvider,
  validateTempoChallenge,
  type PersistedTempoPaymentSnapshot,
  type SafeTempoChallenge,
} from "./snapshot";

export interface TempoPreparedPaymentPort {
  readonly challenge: unknown;
  /** Pull mode only: signs locally and must not broadcast or attach the credential. */
  createCredential(): Promise<string>;
  setCredential(request: RequestInit, credential: string): RequestInit;
}

export interface TempoAgentClientPort {
  preparePayment(
    response: Response,
    options: Readonly<{ request: RequestInit }>,
  ): Promise<TempoPreparedPaymentPort>;
  rawFetch(input: string | URL, init?: RequestInit): Promise<Response>;
}

export type TempoAgentClientFactory = (
  config: EnabledMppProviderConfig,
  fetchImplementation?: typeof globalThis.fetch,
) => TempoAgentClientPort;

export type SafeTempoAgentPaymentResult =
  | Readonly<{
      outcome: "verified";
      orderRef: string;
      paidAt: string;
      receiptDigest: string;
    }>
  | Readonly<{
      outcome: "reconciliation_required";
      orderRef: string;
      safeCode: "RECONCILIATION_REQUIRED";
    }>;

export interface SignedTempoAgentPayment {
  readonly challenge: SafeTempoChallenge;
  /** Resolves the durable state transition before attaching or sending the credential. */
  submitAfterMarkSubmitted(
    hooks: Readonly<{
      markSubmitted: () => Promise<void>;
    }>,
  ): Promise<SafeTempoAgentPaymentResult>;
}

export interface PreparedTempoAgentPayment {
  readonly challenge: SafeTempoChallenge;
  sign(): Promise<SignedTempoAgentPayment>;
}

export interface TempoAgentPaymentAdapter {
  prepare(
    parameters: Readonly<{
      capability: string;
      capabilityDigest: string;
      now: Date;
      signal?: AbortSignal;
      snapshot: unknown;
    }>,
  ): Promise<PreparedTempoAgentPayment>;
}

export function createMppxTempoAgentClient(
  config: EnabledMppProviderConfig,
  fetchImplementation?: typeof globalThis.fetch,
): TempoAgentClientPort {
  const account = privateKeyToAccount(config.demoAgentPrivateKey as `0x${string}`);
  const method = tempo.charge({
    account,
    expectedChainId: TEMPO_TESTNET_CHAIN_ID,
    expectedRecipients: [config.tempoRecipient as `0x${string}`],
    mode: "pull",
  });
  const client = Mppx.create({
    methods: [method],
    polyfill: false,
    ...(fetchImplementation ? { fetch: fetchImplementation } : {}),
  });

  return {
    rawFetch: (input, init) => client.rawFetch(input, init),
    async preparePayment(response, options) {
      const prepared = await client.preparePayment(response, options);
      return {
        challenge: prepared.challenge,
        createCredential: () => prepared.createCredential(),
        setCredential: (request, credential) => prepared.setCredential(request, credential),
      };
    },
  };
}

function initialRequest(capability: string): RequestInit {
  const headers = new Headers({
    accept: "application/json",
    authorization: `Bearer ${capability}`,
  });
  return {
    cache: "no-store",
    headers,
    method: "POST",
    redirect: "error",
  };
}

function withOutboundDeadline(
  request: RequestInit,
  timeoutMs: number,
  upstreamSignal?: AbortSignal,
): RequestInit {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new MppAdapterError("PROVIDER_UNAVAILABLE");
  }
  const signals = [request.signal, upstreamSignal, AbortSignal.timeout(timeoutMs)].filter(
    (signal): signal is AbortSignal => signal instanceof AbortSignal,
  );
  return {
    ...request,
    signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals),
  };
}

function reconciliationRequired(orderRef: string): SafeTempoAgentPaymentResult {
  return Object.freeze({
    outcome: "reconciliation_required",
    orderRef,
    safeCode: "RECONCILIATION_REQUIRED",
  });
}

function verifiedResult(orderRef: string, response: Response): SafeTempoAgentPaymentResult {
  const receipt = response.headers.get(MPP_RECEIPT_HEADER);
  if (!response.ok || !receipt || receipt.length > 65_536) {
    return reconciliationRequired(orderRef);
  }

  try {
    const parsed = Receipt.deserialize(receipt);
    const paidAt = new Date(parsed.timestamp);
    if (
      parsed.method !== "tempo" ||
      parsed.status !== "success" ||
      parsed.reference.length === 0 ||
      parsed.reference.length > 512 ||
      !receiptMatchesOrderReference(parsed.externalId, orderRef) ||
      !Number.isFinite(paidAt.getTime())
    ) {
      return reconciliationRequired(orderRef);
    }

    return Object.freeze({
      outcome: "verified",
      orderRef,
      paidAt: paidAt.toISOString(),
      receiptDigest: createHash("sha256").update(receipt).digest("hex"),
    });
  } catch {
    return reconciliationRequired(orderRef);
  }
}

function createPreparedState(
  parameters: Readonly<{
    client: TempoAgentClientPort;
    config: EnabledMppProviderConfig;
    prepared: TempoPreparedPaymentPort;
    request: RequestInit;
    safeChallenge: SafeTempoChallenge;
    signal?: AbortSignal;
    snapshot: PersistedTempoPaymentSnapshot;
    timeoutMs: number;
  }>,
): PreparedTempoAgentPayment {
  let signing = false;
  let signed = false;

  return Object.freeze({
    challenge: parameters.safeChallenge,
    async sign(): Promise<SignedTempoAgentPayment> {
      if (signing || signed) throw new MppAdapterError("PAYMENT_FAILED");
      signing = true;

      let credential: string;
      try {
        credential = await parameters.prepared.createCredential();
      } catch {
        signing = false;
        throw new MppAdapterError("PROVIDER_UNAVAILABLE", { retryable: true });
      }

      signing = false;
      signed = true;
      let submissionState: "signed" | "marking" | "consumed" = "signed";

      return Object.freeze({
        challenge: parameters.safeChallenge,
        async submitAfterMarkSubmitted({
          markSubmitted,
        }: Readonly<{ markSubmitted: () => Promise<void> }>): Promise<SafeTempoAgentPaymentResult> {
          if (submissionState !== "signed") throw new MppAdapterError("PAYMENT_FAILED");
          submissionState = "marking";

          try {
            await markSubmitted();
          } catch (error) {
            submissionState = "signed";
            // This callback is the local durable boundary and runs before the
            // credential is attached or sent. Preserve its error so the route
            // can classify and safely diagnose a database transition failure.
            throw error;
          }

          submissionState = "consumed";
          try {
            const credentialRequest = parameters.prepared.setCredential(
              parameters.request,
              credential,
            );
            const headers = new Headers(credentialRequest.headers);
            const authorization = headers.get("authorization");
            if (
              !headers.has(MPP_PAYMENT_CREDENTIAL_HEADER) ||
              authorization !== new Headers(parameters.request.headers).get("authorization")
            ) {
              return reconciliationRequired(parameters.snapshot.publicRef);
            }

            const response = await parameters.client.rawFetch(
              parameters.config.merchantUrl,
              withOutboundDeadline(credentialRequest, parameters.timeoutMs, parameters.signal),
            );
            return verifiedResult(parameters.snapshot.publicRef, response);
          } catch {
            return reconciliationRequired(parameters.snapshot.publicRef);
          }
        },
      });
    },
  });
}

export function createTempoAgentPaymentAdapter(
  parameters: Readonly<{
    client?: TempoAgentClientPort;
    clientFactory?: TempoAgentClientFactory;
    config: MppProviderConfig;
    fetch?: typeof globalThis.fetch;
    outboundTimeoutMs?: number;
  }>,
): TempoAgentPaymentAdapter {
  const config = requireEnabledMppProvider(parameters.config);
  const client =
    parameters.client ??
    (parameters.clientFactory ?? createMppxTempoAgentClient)(config, parameters.fetch);
  const timeoutMs = parameters.outboundTimeoutMs ?? MPP_OUTBOUND_TIMEOUT_MS;

  return Object.freeze({
    async prepare({
      capability,
      capabilityDigest,
      now,
      signal,
      snapshot: snapshotInput,
    }: Readonly<{
      capability: string;
      capabilityDigest: string;
      now: Date;
      signal?: AbortSignal;
      snapshot: unknown;
    }>): Promise<PreparedTempoAgentPayment> {
      const snapshot = assertSnapshotMatchesProvider(snapshotInput, config);
      await verifyOrderCapability({
        capability,
        capabilityDigest,
        capabilitySecret: config.capabilitySecret,
        now,
        snapshot,
      });

      const request = initialRequest(capability);
      let response: Response;
      try {
        response = await client.rawFetch(
          config.merchantUrl,
          withOutboundDeadline(request, timeoutMs, signal),
        );
      } catch {
        throw new MppAdapterError("PROVIDER_UNAVAILABLE", { retryable: true });
      }
      if (response.status !== 402) throw new MppAdapterError("PAYMENT_FAILED");

      let prepared: TempoPreparedPaymentPort;
      try {
        prepared = await client.preparePayment(response, { request });
      } catch {
        throw new MppAdapterError("INVALID_PAYMENT_SNAPSHOT", {
          diagnosticStage: "agent_challenge_decode",
        });
      }
      let safeChallenge: SafeTempoChallenge;
      try {
        safeChallenge = validateTempoChallenge(prepared.challenge, snapshot, now);
      } catch {
        throw new MppAdapterError("INVALID_PAYMENT_SNAPSHOT", {
          diagnosticStage: "agent_challenge_validate",
        });
      }

      return createPreparedState({
        client,
        config,
        prepared,
        request,
        safeChallenge,
        signal,
        snapshot,
        timeoutMs,
      });
    },
  });
}
