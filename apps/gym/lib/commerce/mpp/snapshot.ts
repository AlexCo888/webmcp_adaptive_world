import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";

import { z } from "zod";

import {
  MPP_PAYMENT_CREDENTIAL_HEADER,
  ROUTINE_PRO_AMOUNT_MINOR,
  ROUTINE_PRO_CURRENCY,
  ROUTINE_PRO_PRODUCT_KEY,
  TEMPO_TESTNET_CHAIN_ID,
  TEMPO_TOKEN_DECIMALS,
} from "./constants";
import type { EnabledMppProviderConfig } from "./config";
import { MppAdapterError } from "./errors";

const AddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/u);

export const PersistedTempoPaymentSnapshotSchema = z
  .object({
    snapshotVersion: z.literal(1),
    orderId: z.string().uuid(),
    publicRef: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/u),
    provider: z.literal("mpp_tempo"),
    productKey: z.literal(ROUTINE_PRO_PRODUCT_KEY),
    amountMinor: z.literal(ROUTINE_PRO_AMOUNT_MINOR),
    currency: z.literal(ROUTINE_PRO_CURRENCY),
    amountDecimal: z.literal("4.99"),
    tempoAmountAtomic: z.literal("4990000"),
    tempoCurrency: AddressSchema,
    tempoRecipient: AddressSchema,
    tempoDecimals: z.literal(TEMPO_TOKEN_DECIMALS),
    chainId: z.literal(TEMPO_TESTNET_CHAIN_ID),
    realm: z.string().trim().min(1).max(255),
    merchantUrl: z.string().url(),
    scope: z.string().startsWith("/").max(512),
    capabilityVersion: z.number().int().positive(),
    capabilityExpiresAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine(({ merchantUrl, realm, scope }, context) => {
    const url = new URL(merchantUrl);
    const localHttp = url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username !== "" ||
      url.password !== "" ||
      url.search !== "" ||
      url.hash !== "" ||
      url.toString() !== merchantUrl
    ) {
      context.addIssue({
        code: "custom",
        message: "The snapshotted merchant URL is not canonical",
        path: ["merchantUrl"],
      });
    }
    if (url.pathname !== scope) {
      context.addIssue({
        code: "custom",
        message: "The snapshotted merchant URL and scope do not match",
        path: ["scope"],
      });
    }
    if (url.host !== realm) {
      context.addIssue({
        code: "custom",
        message: "The snapshotted realm and merchant host do not match",
        path: ["realm"],
      });
    }
  });

export type PersistedTempoPaymentSnapshot = Readonly<
  z.infer<typeof PersistedTempoPaymentSnapshotSchema>
>;

export function parsePersistedTempoPaymentSnapshot(input: unknown): PersistedTempoPaymentSnapshot {
  const parsed = PersistedTempoPaymentSnapshotSchema.safeParse(input);
  if (!parsed.success) throw new MppAdapterError("INVALID_PAYMENT_SNAPSHOT");

  return Object.freeze({
    ...parsed.data,
    tempoCurrency: parsed.data.tempoCurrency.toLowerCase(),
    tempoRecipient: parsed.data.tempoRecipient.toLowerCase(),
  });
}

export function canonicalizeTempoPaymentSnapshot(snapshotInput: unknown): string {
  const snapshot = parsePersistedTempoPaymentSnapshot(snapshotInput);
  return JSON.stringify({
    snapshotVersion: snapshot.snapshotVersion,
    orderId: snapshot.orderId,
    publicRef: snapshot.publicRef,
    provider: snapshot.provider,
    productKey: snapshot.productKey,
    amountMinor: snapshot.amountMinor,
    currency: snapshot.currency,
    amountDecimal: snapshot.amountDecimal,
    tempoAmountAtomic: snapshot.tempoAmountAtomic,
    tempoCurrency: snapshot.tempoCurrency,
    tempoRecipient: snapshot.tempoRecipient,
    tempoDecimals: snapshot.tempoDecimals,
    chainId: snapshot.chainId,
    realm: snapshot.realm,
    merchantUrl: snapshot.merchantUrl,
    scope: snapshot.scope,
    capabilityVersion: snapshot.capabilityVersion,
    capabilityExpiresAt: snapshot.capabilityExpiresAt,
  });
}

export function digestTempoPaymentSnapshot(snapshot: PersistedTempoPaymentSnapshot): string {
  return createHash("sha256").update(canonicalizeTempoPaymentSnapshot(snapshot)).digest("hex");
}

export type TempoChargeOptions = Readonly<{
  amount: "4.99";
  description: "Adaptive Routine Pro";
  expires: string;
  externalId: string;
  meta: Readonly<Record<string, string>>;
  scope: string;
}>;

export function buildTempoChargeOptions(snapshotInput: unknown): TempoChargeOptions {
  const snapshot = parsePersistedTempoPaymentSnapshot(snapshotInput);
  return Object.freeze({
    amount: snapshot.amountDecimal,
    description: "Adaptive Routine Pro",
    expires: snapshot.capabilityExpiresAt,
    externalId: snapshot.publicRef,
    meta: Object.freeze({
      publicRef: snapshot.publicRef,
      productKey: snapshot.productKey,
      snapshotDigest: digestTempoPaymentSnapshot(snapshot),
      capabilityVersion: String(snapshot.capabilityVersion),
    }),
    scope: snapshot.scope,
  });
}

export function assertSnapshotMatchesProvider(
  snapshotInput: unknown,
  config: EnabledMppProviderConfig,
): PersistedTempoPaymentSnapshot {
  const snapshot = parsePersistedTempoPaymentSnapshot(snapshotInput);
  const matches =
    snapshot.chainId === TEMPO_TESTNET_CHAIN_ID &&
    snapshot.realm === config.realm &&
    snapshot.merchantUrl === config.merchantUrl &&
    snapshot.scope === config.scope &&
    snapshot.tempoCurrency === config.tempoCurrency.toLowerCase() &&
    snapshot.tempoRecipient === config.tempoRecipient.toLowerCase();

  if (!matches) throw new MppAdapterError("INVALID_PAYMENT_SNAPSHOT");
  return snapshot;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MppAdapterError("INVALID_PAYMENT_SNAPSHOT");
  }
  return value as UnknownRecord;
}

function hasExactKeys(record: UnknownRecord, expected: readonly string[]): boolean {
  const actual = Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)
    .sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function decodeOpaqueMeta(opaque: unknown): UnknownRecord | null {
  if (typeof opaque !== "string" || !/^[A-Za-z0-9_-]+$/u.test(opaque)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(opaque, "base64url").toString("utf8")) as unknown;
    if (decoded === null || typeof decoded !== "object" || Array.isArray(decoded)) return null;
    return decoded as UnknownRecord;
  } catch {
    return null;
  }
}

function opaqueMatchesMeta(opaque: unknown, meta: UnknownRecord): boolean {
  const decodedMeta = decodeOpaqueMeta(opaque);
  return (
    decodedMeta !== null &&
    hasExactKeys(decodedMeta, Object.keys(meta).sort()) &&
    Object.entries(meta).every(([key, value]) => decodedMeta[key] === value)
  );
}

export type SafeTempoChallenge = Readonly<{
  /** Provider identity for durable setup attachment. Do not include in WebMCP output. */
  challengeId: string;
  method: "tempo";
  intent: "charge";
  orderRef: string;
  expiresAt: string;
  snapshotDigest: string;
}>;

export function validateTempoChallenge(
  challengeInput: unknown,
  snapshotInput: unknown,
  now: Date,
): SafeTempoChallenge {
  const snapshot = parsePersistedTempoPaymentSnapshot(snapshotInput);
  const challenge = asRecord(challengeInput);
  const request = asRecord(challenge.request);
  const methodDetails = asRecord(request.methodDetails);
  const meta =
    challenge.meta === undefined ? decodeOpaqueMeta(challenge.opaque) : asRecord(challenge.meta);
  if (meta === null) throw new MppAdapterError("INVALID_PAYMENT_SNAPSHOT");
  const supportedModes = methodDetails.supportedModes;
  const challengeId = typeof challenge.id === "string" ? challenge.id : "";

  const validModes =
    Array.isArray(supportedModes) && supportedModes.length === 1 && supportedModes[0] === "pull";
  const validRequestShape = hasExactKeys(request, [
    "amount",
    "currency",
    "externalId",
    "methodDetails",
    "recipient",
  ]);
  const validMethodDetailsShape = hasExactKeys(methodDetails, ["chainId", "supportedModes"]);
  const validMetaShape = hasExactKeys(meta, [
    "_mppx_scope",
    "capabilityVersion",
    "productKey",
    "publicRef",
    "snapshotDigest",
  ]);
  const unexpired = now.getTime() < new Date(snapshot.capabilityExpiresAt).getTime();
  const valid =
    /^[A-Za-z0-9_-]{43}$/u.test(challengeId) &&
    challenge.method === "tempo" &&
    challenge.intent === "charge" &&
    challenge.realm === snapshot.realm &&
    challenge.description === "Adaptive Routine Pro" &&
    challenge.expires === snapshot.capabilityExpiresAt &&
    challenge.header === MPP_PAYMENT_CREDENTIAL_HEADER &&
    request.amount === snapshot.tempoAmountAtomic &&
    typeof request.currency === "string" &&
    request.currency.toLowerCase() === snapshot.tempoCurrency &&
    typeof request.recipient === "string" &&
    request.recipient.toLowerCase() === snapshot.tempoRecipient &&
    request.externalId === snapshot.publicRef &&
    methodDetails.chainId === TEMPO_TESTNET_CHAIN_ID &&
    validRequestShape &&
    validMethodDetailsShape &&
    validModes &&
    validMetaShape &&
    meta.publicRef === snapshot.publicRef &&
    meta.productKey === snapshot.productKey &&
    meta.snapshotDigest === digestTempoPaymentSnapshot(snapshot) &&
    meta.capabilityVersion === String(snapshot.capabilityVersion) &&
    meta._mppx_scope === snapshot.scope &&
    opaqueMatchesMeta(challenge.opaque, meta) &&
    unexpired;

  if (!valid) throw new MppAdapterError("INVALID_PAYMENT_SNAPSHOT");

  return Object.freeze({
    challengeId,
    method: "tempo",
    intent: "charge",
    orderRef: snapshot.publicRef,
    expiresAt: snapshot.capabilityExpiresAt,
    snapshotDigest: digestTempoPaymentSnapshot(snapshot),
  });
}
