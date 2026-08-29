import { canonicalizeJson, sha256Hex } from "./canonical-json";

const textEncoder = new TextEncoder();
const CAPABILITY_BYTES = 32;

export interface RoutineProCapabilityAuthority {
  readonly amountMinor: number;
  readonly capabilityExpiresAt: Date | string;
  readonly capabilityVersion: number;
  readonly currency: string;
  readonly productKey: string;
  readonly publicRef: string;
}

export interface VerifyRoutineProCapabilityOptions {
  readonly now?: Date;
  readonly secret: string | Uint8Array;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(value)) return null;
  try {
    const padded = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return bytes.length === CAPABILITY_BYTES && bytesToBase64Url(bytes) === value ? bytes : null;
  } catch {
    return null;
  }
}

function secretBytes(secret: string | Uint8Array): Uint8Array {
  const bytes = typeof secret === "string" ? textEncoder.encode(secret) : secret;
  if (bytes.byteLength < 32) {
    throw new TypeError("Routine Pro capability secrets must contain at least 32 bytes");
  }
  return bytes;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function normalizeAuthority(input: RoutineProCapabilityAuthority) {
  if (!/^[A-Za-z0-9_-]{8,64}$/u.test(input.publicRef)) {
    throw new TypeError("Routine Pro order references must be opaque and 8-64 characters long");
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(input.productKey)) {
    throw new TypeError("Routine Pro product key is invalid");
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new RangeError("Routine Pro amount must be a positive safe integer");
  }
  if (!/^[a-z0-9]{3,12}$/u.test(input.currency)) {
    throw new TypeError("Routine Pro currency must be a lowercase server currency");
  }
  if (!Number.isSafeInteger(input.capabilityVersion) || input.capabilityVersion <= 0) {
    throw new RangeError("Routine Pro capability version must be a positive safe integer");
  }

  const expiresAt =
    input.capabilityExpiresAt instanceof Date
      ? input.capabilityExpiresAt
      : new Date(input.capabilityExpiresAt);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new TypeError("Routine Pro capability expiry is invalid");
  }

  return {
    amountMinor: input.amountMinor,
    capabilityExpiresAt: expiresAt.toISOString(),
    capabilityVersion: input.capabilityVersion,
    currency: input.currency,
    productKey: input.productKey,
    publicRef: input.publicRef,
  } as const;
}

function authorityBytes(input: RoutineProCapabilityAuthority): ArrayBuffer {
  return copyToArrayBuffer(textEncoder.encode(canonicalizeJson(normalizeAuthority(input))));
}

async function hmacKey(
  secret: string | Uint8Array,
  usages: readonly ("sign" | "verify")[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    copyToArrayBuffer(secretBytes(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

/**
 * Regenerates the hidden order capability from persisted immutable authority.
 * No random value or current time participates in the derivation.
 */
export async function createRoutineProCapability(
  input: RoutineProCapabilityAuthority,
  secret: string | Uint8Array,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret, ["sign"]),
    authorityBytes(input),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function digestRoutineProCapability(capability: string): Promise<string> {
  return sha256Hex(capability);
}

/**
 * Web Crypto performs the HMAC comparison without a JavaScript early-exit loop.
 * Expiry is checked from the same persisted value that is bound into the HMAC.
 */
export async function verifyRoutineProCapability(
  capability: string,
  input: RoutineProCapabilityAuthority,
  options: VerifyRoutineProCapabilityOptions,
): Promise<boolean> {
  let authority: ReturnType<typeof normalizeAuthority>;
  try {
    authority = normalizeAuthority(input);
  } catch {
    return false;
  }
  const signature = base64UrlToBytes(capability);
  if (!signature) return false;
  const now = options.now ?? new Date();
  if (
    !Number.isFinite(now.getTime()) ||
    Date.parse(authority.capabilityExpiresAt) <= now.getTime()
  ) {
    return false;
  }
  try {
    return crypto.subtle.verify(
      "HMAC",
      await hmacKey(options.secret, ["verify"]),
      copyToArrayBuffer(signature),
      copyToArrayBuffer(textEncoder.encode(canonicalizeJson(authority))),
    );
  } catch {
    return false;
  }
}
