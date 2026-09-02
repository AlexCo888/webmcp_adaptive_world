import type { CommerceSafeCode } from "@adaptive-world/contracts";
import { NextResponse } from "next/server";

const ERROR_STATUS: Record<CommerceSafeCode, number> = {
  AUTH_REQUIRED: 401,
  CONTEXT_REQUIRED: 401,
  CONTEXT_EXPIRED: 401,
  PAYMENT_REQUIRED: 402,
  ALREADY_ENTITLED: 409,
  ORDER_PENDING: 409,
  ORDER_EXPIRED: 409,
  QUOTE_CHANGED: 409,
  ROUTINE_CONFLICT: 409,
  PRICE_MISMATCH: 409,
  PAYMENT_REPLAY: 409,
  BUDGET_EXCEEDED: 409,
  PROVIDER_SETUP_PENDING: 409,
  PROVIDER_SETUP_RECONCILIATION_REQUIRED: 409,
  PROVIDER_UNAVAILABLE: 503,
  RECONCILIATION_REQUIRED: 409,
  FULFILLMENT_PENDING: 202,
  PAYMENT_FAILED: 402,
  RATE_LIMITED: 429,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_ERROR: 500,
};

const SAFE_MESSAGES: Record<CommerceSafeCode, string> = {
  AUTH_REQUIRED: "Sign in before continuing.",
  CONTEXT_REQUIRED: "Connect a one-use Passport context before continuing.",
  CONTEXT_EXPIRED: "The connected Passport context is no longer active.",
  PAYMENT_REQUIRED: "Adaptive Routine Pro is required for personalized routines.",
  ALREADY_ENTITLED: "Adaptive Routine Pro is already active.",
  ORDER_PENDING:
    "A payment for this Gym session is already in progress. Read the current Routine Pro status; do not start another payment.",
  ORDER_EXPIRED: "The payment window has expired.",
  QUOTE_CHANGED: "The offer changed. Review it again before continuing.",
  ROUTINE_CONFLICT:
    "A different routine is already saved for this Gym session. Review the saved routine before submitting another.",
  PRICE_MISMATCH: "The verified payment did not match the product price.",
  PAYMENT_REPLAY: "That payment proof was already processed.",
  BUDGET_EXCEEDED: "The demo agent daily test budget is not sufficient.",
  PROVIDER_SETUP_PENDING: "The existing test checkout is still being prepared.",
  PROVIDER_SETUP_RECONCILIATION_REQUIRED:
    "The test checkout needs reconciliation before it can be retried.",
  PROVIDER_UNAVAILABLE: "The selected sandbox payment provider is unavailable.",
  RECONCILIATION_REQUIRED: "The payment needs reconciliation before continuing.",
  FULFILLMENT_PENDING: "Payment was verified and entitlement fulfillment is being retried.",
  PAYMENT_FAILED: "The sandbox payment was not completed.",
  RATE_LIMITED: "Too many payment attempts. Wait before trying again.",
  INVALID_REQUEST: "The request was invalid.",
  NOT_FOUND: "The requested resource was not found.",
  INTERNAL_ERROR: "The request could not be completed.",
};

const MAX_SAFE_MESSAGE_CHARS = 240;

/**
 * `detail` is an optional, already-safe sentence (for example a validation
 * reason about the caller's own submitted routine). It never carries secrets,
 * identifiers, or provider payloads, and the combined message stays within the
 * bounded error envelope so an agent can self-correct without another payment.
 */
export class CommerceError extends Error {
  constructor(
    readonly code: CommerceSafeCode,
    readonly retryable = false,
    detail?: string,
  ) {
    super(
      detail
        ? `${SAFE_MESSAGES[code]} ${detail}`.slice(0, MAX_SAFE_MESSAGE_CHARS)
        : SAFE_MESSAGES[code],
    );
  }
}

export function requestId(request?: Request): string {
  const supplied = request?.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function success<T>(data: T, id: string, status = 200) {
  return NextResponse.json(
    { ok: true as const, data, requestId: id },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

export function failure(error: unknown, id: string) {
  const safe = error instanceof CommerceError ? error : new CommerceError("INTERNAL_ERROR", true);
  return NextResponse.json(
    {
      ok: false as const,
      error: { code: safe.code, message: safe.message, retryable: safe.retryable },
      requestId: id,
    },
    {
      status: ERROR_STATUS[safe.code],
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
        "referrer-policy": "no-referrer",
      },
    },
  );
}

export function assertSameOrigin(
  request: Request,
  configuredGymUrl = process.env.NEXT_PUBLIC_GYM_URL ?? "http://127.0.0.1:3001",
): void {
  let requestOrigin: string;
  try {
    requestOrigin = new URL(configuredGymUrl).origin;
  } catch {
    throw new CommerceError("INVALID_REQUEST");
  }
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestOrigin) throw new CommerceError("INVALID_REQUEST");
}

export async function parseBoundedJson(request: Request, maxBytes = 8_192): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") throw new CommerceError("INVALID_REQUEST");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > maxBytes) throw new CommerceError("INVALID_REQUEST");
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > maxBytes) {
    throw new CommerceError("INVALID_REQUEST");
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new CommerceError("INVALID_REQUEST");
  }
}
