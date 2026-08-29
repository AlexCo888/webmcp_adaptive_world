export const DEFAULT_TOOL_OUTPUT_LIMIT = 1_500;
export const MIN_TOOL_OUTPUT_LIMIT = 128;

export const WEBMCP_ERROR_CODES = [
  "ABORTED",
  "CONFIRMATION_REQUIRED",
  "MUTATION_DECLINED",
  "INVALID_PREPARATION",
  "EXECUTION_FAILED",
  "SERIALIZATION_FAILED",
  "OUTPUT_TOO_LARGE",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "EXPIRED",
  "CONFLICT",
  "UNAVAILABLE",
  "PAYMENT_REQUIRED",
  "ALREADY_ENTITLED",
  "ORDER_PENDING",
  "ORDER_EXPIRED",
  "QUOTE_CHANGED",
  "PRICE_MISMATCH",
  "PAYMENT_REPLAY",
  "BUDGET_EXCEEDED",
  "PROVIDER_SETUP_PENDING",
  "PROVIDER_SETUP_RECONCILIATION_REQUIRED",
  "PROVIDER_UNAVAILABLE",
  "RECONCILIATION_REQUIRED",
  "FULFILLMENT_PENDING",
  "PAYMENT_FAILED",
] as const;

export type WebMCPErrorCode = (typeof WEBMCP_ERROR_CODES)[number];

const webMcpErrorCodeSet = new Set<string>(WEBMCP_ERROR_CODES);

export interface WebMCPErrorEnvelope {
  readonly ok: false;
  readonly error: {
    readonly code: WebMCPErrorCode;
    readonly message: string;
  };
  readonly meta?: Readonly<Record<string, unknown>>;
}

export interface WebMCPSuccessEnvelope<T = unknown> {
  readonly ok: true;
  readonly data: T;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export type WebMCPEnvelope<T = unknown> = WebMCPSuccessEnvelope<T> | WebMCPErrorEnvelope;

/** An explicitly safe error that may cross the WebMCP execution boundary. */
export class WebMCPToolError extends Error {
  readonly code: WebMCPErrorCode;

  constructor(code: WebMCPErrorCode, message: string) {
    super(message);
    this.name = "WebMCPToolError";
    this.code = code;
  }
}

export function toSafeWebMCPError(error: unknown, signal?: AbortSignal): WebMCPToolError {
  if (error instanceof WebMCPToolError) return error;
  if (
    signal?.aborted ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  ) {
    return new WebMCPToolError("ABORTED", "The WebMCP action was cancelled.");
  }
  return new WebMCPToolError("EXECUTION_FAILED", "The WebMCP action could not be completed.");
}

export function webMcpSuccess<T>(data: T): WebMCPSuccessEnvelope<T> {
  return { ok: true, data };
}

export function webMcpFailure(code: WebMCPErrorCode, message: string): WebMCPErrorEnvelope {
  return { ok: false, error: { code, message } };
}

function isEnvelope(value: unknown): value is WebMCPEnvelope {
  if (!value || typeof value !== "object" || !("ok" in value)) return false;
  const candidate = value as {
    readonly ok?: unknown;
    readonly data?: unknown;
    readonly error?: unknown;
  };
  if (candidate.ok === true) return "data" in candidate;
  if (candidate.ok !== false || !candidate.error || typeof candidate.error !== "object") {
    return false;
  }
  const error = candidate.error as { readonly code?: unknown; readonly message?: unknown };
  return (
    typeof error.code === "string" &&
    webMcpErrorCodeSet.has(error.code) &&
    typeof error.message === "string" &&
    error.message.trim().length > 0 &&
    error.message.length <= 300
  );
}

function normalizeEnvelope(value: unknown): WebMCPEnvelope {
  if (isEnvelope(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    (("ok" in value && value.ok === false) || "error" in value)
  ) {
    return webMcpFailure("EXECUTION_FAILED", "The WebMCP action could not be completed.");
  }
  return webMcpSuccess(value === undefined ? null : value);
}

function safeSerialize(value: WebMCPEnvelope): string {
  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === "bigint") return item.toString();
      if (typeof item === "undefined") return null;
      if (typeof item === "function" || typeof item === "symbol") return "[unsupported]";
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[circular]";
        seen.add(item);
      }
      return item;
    });
    return (
      serialized ?? JSON.stringify(webMcpFailure("SERIALIZATION_FAILED", "Output unavailable."))
    );
  } catch {
    return JSON.stringify(webMcpFailure("SERIALIZATION_FAILED", "Output unavailable."));
  }
}

/**
 * Produces one valid JSON envelope within Chrome's current ~1.5K-character guidance.
 * Oversized payloads fail closed instead of returning a misleading JSON fragment.
 */
export function limitToolOutput(value: unknown, maxChars = DEFAULT_TOOL_OUTPUT_LIMIT): string {
  const budget = Math.max(MIN_TOOL_OUTPUT_LIMIT, Math.floor(maxChars));
  const serialized = safeSerialize(normalizeEnvelope(value));
  if (serialized.length <= budget) return serialized;

  return JSON.stringify(webMcpFailure("OUTPUT_TOO_LARGE", "Narrow the request."));
}
