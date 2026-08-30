import { createHash } from "node:crypto";

import { Challenge, Receipt } from "mppx";
import { Mppx, tempo, type Store } from "mppx/server";

import { verifyOrderCapability } from "./capability";
import { MPP_RECEIPT_HEADER } from "./constants";
import type { EnabledMppProviderConfig, MppProviderConfig } from "./config";
import { requireEnabledMppProvider } from "./config";
import { MppAdapterError, type MppDiagnosticStage } from "./errors";
import {
  assertSnapshotMatchesProvider,
  buildTempoChargeOptions,
  validateTempoChallenge,
  type PersistedTempoPaymentSnapshot,
  type SafeTempoChallenge,
  type TempoChargeOptions,
} from "./snapshot";

export type TempoMerchantProviderResult =
  | Readonly<{ challenge: Response; status: 402 }>
  | Readonly<{ status: 200; withReceipt(response?: Response): Response }>;

export interface TempoMerchantProviderPort {
  createChallenge(options: TempoChargeOptions): Promise<unknown>;
  handle(request: Request, options: TempoChargeOptions): Promise<TempoMerchantProviderResult>;
}

export type TempoMerchantProviderFactory = (
  config: EnabledMppProviderConfig,
  store: Store.AtomicStore,
) => TempoMerchantProviderPort;

export type SafeTempoMerchantResult =
  | Readonly<{
      outcome: "payment_required";
      orderRef: string;
      challenge: SafeTempoChallenge;
    }>
  | Readonly<{
      outcome: "verified";
      orderRef: string;
      paidAt: string;
      receiptDigest: string;
    }>;

export type TempoMerchantResult =
  | Readonly<{
      protocolResponse: Response;
      safe: Extract<SafeTempoMerchantResult, { outcome: "payment_required" }>;
      status: 402;
    }>
  | Readonly<{
      evidence: Readonly<{
        providerPaymentRef: string;
        paidAt: Date;
        receiptDigest: string;
      }>;
      safe: Extract<SafeTempoMerchantResult, { outcome: "verified" }>;
      status: 200;
      withReceipt(response: Response): Response;
    }>;

export interface TempoMerchantAdapter {
  createSafeChallenge(
    parameters: Readonly<{
      now: Date;
      snapshot: unknown;
    }>,
  ): Promise<SafeTempoChallenge>;
  handle(
    parameters: Readonly<{
      capabilityDigest: string;
      now: Date;
      request: Request;
      snapshot: unknown;
    }>,
  ): Promise<TempoMerchantResult>;
}

function atStage(error: unknown, diagnosticStage: MppDiagnosticStage): MppAdapterError {
  return error instanceof MppAdapterError
    ? new MppAdapterError(error.safeCode, {
        retryable: error.retryable,
        diagnosticStage: error.diagnosticStage ?? diagnosticStage,
      })
    : new MppAdapterError("PROVIDER_UNAVAILABLE", { retryable: true, diagnosticStage });
}

export function createMppxTempoMerchantProvider(
  config: EnabledMppProviderConfig,
  store: Store.AtomicStore,
): TempoMerchantProviderPort {
  const charge = tempo.charge({
    currency: config.tempoCurrency as `0x${string}`,
    html: false,
    recipient: config.tempoRecipient as `0x${string}`,
    sponsorBudget: false,
    store,
    supportedModes: ["pull"],
    testnet: true,
    waitForConfirmation: true,
  });
  const merchant = Mppx.create({
    methods: [charge],
    realm: config.realm,
    requiresAuth: true,
    secretKey: config.secretKey,
  });

  return {
    createChallenge: (options) => merchant.challenge.tempo.charge(options),
    handle: (request, options) => merchant.tempo.charge(options)(request),
  };
}

async function requestContainsBytes(request: Request): Promise<boolean> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 0) return true;
  }
  const body = request.clone().body;
  if (!body) return false;
  const reader = body.getReader();
  try {
    for (let readCount = 0; readCount < 4; readCount += 1) {
      const chunk = await reader.read();
      if (chunk.done) return false;
      if (chunk.value.byteLength > 0) return true;
    }
    return true;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function extractCapability(request: Request, merchantUrl: string): Promise<string> {
  if (request.method !== "POST") {
    throw new MppAdapterError("PAYMENT_FAILED", {
      diagnosticStage: "merchant_request_method",
    });
  }
  if (request.url !== merchantUrl) {
    throw new MppAdapterError("PAYMENT_FAILED", {
      diagnosticStage: "merchant_request_url",
    });
  }
  if (await requestContainsBytes(request)) {
    throw new MppAdapterError("PAYMENT_FAILED", {
      diagnosticStage: "merchant_request_body",
    });
  }
  const authorization = request.headers.get("authorization");
  const matched = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/u);
  if (!matched?.[1]) {
    throw new MppAdapterError("PAYMENT_FAILED", {
      diagnosticStage: "merchant_request_header",
    });
  }
  return matched[1];
}

function receiptCarrier(
  withReceipt: (response?: Response) => Response,
  expectedOrderRef: string,
): Readonly<{
  header: string;
  paidAt: Date;
  receipt: Receipt.Receipt;
}> {
  try {
    const response = withReceipt(new Response(null, { status: 204 }));
    const header = response.headers.get(MPP_RECEIPT_HEADER);
    if (!header || header.length > 65_536) throw new TypeError("Missing receipt");
    const receipt = Receipt.deserialize(header);
    const paidAt = new Date(receipt.timestamp);
    if (
      receipt.method !== "tempo" ||
      receipt.status !== "success" ||
      receipt.reference.length === 0 ||
      receipt.reference.length > 512 ||
      receipt.externalId !== expectedOrderRef ||
      !Number.isFinite(paidAt.getTime())
    ) {
      throw new TypeError("Invalid receipt");
    }
    return { header, paidAt, receipt };
  } catch {
    throw new MppAdapterError("RECONCILIATION_REQUIRED", {
      diagnosticStage: "merchant_receipt_validate",
    });
  }
}

function attachReceipt(response: Response, header: string): Response {
  const headers = new Headers(response.headers);
  headers.set(MPP_RECEIPT_HEADER, header);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

export function createTempoMerchantAdapter(
  parameters: Readonly<{
    config: MppProviderConfig;
    provider?: TempoMerchantProviderPort;
    providerFactory?: TempoMerchantProviderFactory;
    store: Store.AtomicStore;
  }>,
): TempoMerchantAdapter {
  const config = requireEnabledMppProvider(parameters.config);
  const provider =
    parameters.provider ??
    (parameters.providerFactory ?? createMppxTempoMerchantProvider)(config, parameters.store);

  return Object.freeze({
    async createSafeChallenge({
      now,
      snapshot: snapshotInput,
    }: Readonly<{ now: Date; snapshot: unknown }>): Promise<SafeTempoChallenge> {
      let snapshot: PersistedTempoPaymentSnapshot;
      try {
        snapshot = assertSnapshotMatchesProvider(snapshotInput, config);
      } catch (error) {
        throw atStage(error, "merchant_snapshot_match");
      }
      let challenge: unknown;
      try {
        challenge = await provider.createChallenge(buildTempoChargeOptions(snapshot));
      } catch (error) {
        throw atStage(error, "merchant_provider_handle");
      }
      try {
        return validateTempoChallenge(challenge, snapshot, now);
      } catch (error) {
        throw atStage(error, "merchant_challenge_validate");
      }
    },

    async handle({
      capabilityDigest,
      now,
      request,
      snapshot: snapshotInput,
    }: Readonly<{
      capabilityDigest: string;
      now: Date;
      request: Request;
      snapshot: unknown;
    }>): Promise<TempoMerchantResult> {
      let snapshot: PersistedTempoPaymentSnapshot;
      try {
        snapshot = assertSnapshotMatchesProvider(snapshotInput, config);
      } catch (error) {
        throw atStage(error, "merchant_snapshot_match");
      }
      let capability: string;
      try {
        capability = await extractCapability(request, config.merchantUrl);
      } catch (error) {
        throw atStage(error, "merchant_capability_extract");
      }
      try {
        await verifyOrderCapability({
          capability,
          capabilityDigest,
          capabilitySecret: config.capabilitySecret,
          now,
          snapshot,
        });
      } catch (error) {
        throw atStage(error, "merchant_capability_verify");
      }

      let result: TempoMerchantProviderResult;
      try {
        result = await provider.handle(request, buildTempoChargeOptions(snapshot));
      } catch (error) {
        throw atStage(error, "merchant_provider_handle");
      }
      if (result.status === 402) {
        let protocolChallenge: unknown;
        try {
          protocolChallenge = Challenge.fromResponse(result.challenge);
        } catch (error) {
          throw atStage(error, "merchant_challenge_decode");
        }
        let safeChallenge: SafeTempoChallenge;
        try {
          safeChallenge = validateTempoChallenge(protocolChallenge, snapshot, now);
        } catch (error) {
          throw atStage(error, "merchant_challenge_validate");
        }
        return Object.freeze({
          protocolResponse: result.challenge,
          safe: Object.freeze({
            outcome: "payment_required",
            orderRef: snapshot.publicRef,
            challenge: safeChallenge,
          }),
          status: 402,
        });
      }

      const carrier = receiptCarrier(result.withReceipt, snapshot.publicRef);
      const receiptDigest = createHash("sha256").update(carrier.header).digest("hex");
      return Object.freeze({
        evidence: Object.freeze({
          providerPaymentRef: carrier.receipt.reference,
          paidAt: carrier.paidAt,
          receiptDigest,
        }),
        safe: Object.freeze({
          outcome: "verified",
          orderRef: snapshot.publicRef,
          paidAt: carrier.paidAt.toISOString(),
          receiptDigest,
        }),
        status: 200,
        withReceipt: (response: Response) => attachReceipt(response, carrier.header),
      });
    },
  });
}
