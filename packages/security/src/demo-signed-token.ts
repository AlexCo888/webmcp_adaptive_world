type JsonRecord = Record<string, unknown>;

export interface DemoTokenClaims<T extends JsonRecord = JsonRecord> {
  readonly iss: string;
  readonly aud: string;
  readonly sub: string;
  readonly typ: string;
  readonly iat: number;
  readonly exp: number;
  readonly jti: string;
  readonly data: T;
}

export interface SignDemoTokenInput<T extends JsonRecord> {
  readonly issuer: string;
  readonly audience: string;
  readonly subject: string;
  readonly type: string;
  readonly data: T;
  readonly ttlSeconds: number;
  readonly now?: Date;
  readonly tokenId?: string;
  readonly secret?: string;
}

export interface VerifyDemoTokenInput {
  readonly issuer: string;
  readonly audience: string;
  readonly type: string;
  readonly now?: Date;
  readonly secret?: string;
}

const textEncoder = new TextEncoder();
const DEMO_SECRET = "adaptive-world-public-synthetic-demo-v2-rotate-before-real-data-2026";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function stringToBase64Url(value: string): string {
  return bytesToBase64Url(textEncoder.encode(value));
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function base64UrlToString(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

function resolveSecret(override?: string): string {
  if (override) return override;
  if (typeof process !== "undefined" && process.env.ADAPTIVE_WORLD_DEMO_SECRET) {
    return process.env.ADAPTIVE_WORLD_DEMO_SECRET;
  }
  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "production" &&
    process.env.CI !== "true"
  ) {
    throw new Error("ADAPTIVE_WORLD_DEMO_SECRET is required in production");
  }
  return DEMO_SECRET;
}

async function hmacKey(secret?: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(resolveSecret(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/**
 * Compact HMAC token used only by the public synthetic demo. The repository fallback
 * key intentionally makes this unsuitable for real health data. Production fails closed
 * unless ADAPTIVE_WORLD_DEMO_SECRET is configured.
 */
export async function signDemoToken<T extends JsonRecord>(
  input: SignDemoTokenInput<T>,
): Promise<string> {
  if (
    !Number.isSafeInteger(input.ttlSeconds) ||
    input.ttlSeconds < 1 ||
    input.ttlSeconds > 86_400
  ) {
    throw new RangeError("Demo token TTL must be between 1 second and 24 hours");
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
  const header = stringToBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload: DemoTokenClaims<T> = {
    iss: input.issuer,
    aud: input.audience,
    sub: input.subject,
    typ: input.type,
    iat: nowSeconds,
    exp: nowSeconds + input.ttlSeconds,
    jti: input.tokenId ?? crypto.randomUUID(),
    data: input.data,
  };
  const body = stringToBase64Url(JSON.stringify(payload));
  const unsigned = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(input.secret),
    textEncoder.encode(unsigned),
  );
  return `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyDemoToken<T extends JsonRecord>(
  token: string,
  input: VerifyDemoTokenInput,
): Promise<DemoTokenClaims<T> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  if (!header || !body || !signature) return null;
  try {
    const parsedHeader = JSON.parse(base64UrlToString(header)) as JsonRecord;
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;
    const signatureBytes = Uint8Array.from(base64UrlToBytes(signature));
    const verified = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(input.secret),
      signatureBytes,
      textEncoder.encode(`${header}.${body}`),
    );
    if (!verified) return null;
    const claims = JSON.parse(base64UrlToString(body)) as DemoTokenClaims<T>;
    const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1_000);
    if (
      claims.iss !== input.issuer ||
      claims.aud !== input.audience ||
      claims.typ !== input.type ||
      !Number.isSafeInteger(claims.iat) ||
      !Number.isSafeInteger(claims.exp) ||
      claims.exp <= nowSeconds ||
      claims.iat > nowSeconds + 60 ||
      !claims.sub ||
      !claims.jti ||
      !claims.data ||
      typeof claims.data !== "object"
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  if (verifier.length < 40) throw new TypeError("PKCE verifier is too short");
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(verifier));
  return bytesToBase64Url(new Uint8Array(digest));
}
