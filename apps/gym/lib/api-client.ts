"use client";

import { WEBMCP_ERROR_CODES, WebMCPToolError, type WebMCPErrorCode } from "@adaptive-world/webmcp";

function webMcpCode(code: string, status: number): WebMCPErrorCode {
  if ((WEBMCP_ERROR_CODES as readonly string[]).includes(code)) {
    return code as WebMCPErrorCode;
  }
  if (code === "CONTEXT_REQUIRED" || code === "CONTEXT_EXPIRED" || status === 401) {
    return "UNAUTHENTICATED";
  }
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 402) return "PAYMENT_REQUIRED";
  if (status === 409 || code === "SESSION_MISMATCH") return "CONFLICT";
  if (status === 400) return "VALIDATION";
  return "EXECUTION_FAILED";
}

export class GymApiError extends WebMCPToolError {
  readonly apiCode: string;
  readonly status: number;

  constructor(code: string, status: number, message = "The request could not be completed.") {
    super(webMcpCode(code, status), message);
    this.apiCode = code;
    this.status = status;
  }
}

export async function fetchBoundedJson<T>(
  input: string,
  init: RequestInit = {},
  options: { signal?: AbortSignal; maxBytes?: number } = {},
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    signal: options.signal,
    headers: { accept: "application/json", ...init.headers },
  });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new GymApiError("INVALID_RESPONSE", response.status);
  }
  const maxBytes = options.maxBytes ?? 64 * 1_024;
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new GymApiError("OUTPUT_TOO_LARGE", response.status);
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new GymApiError("OUTPUT_TOO_LARGE", response.status);
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new GymApiError("INVALID_RESPONSE", response.status);
  }
  if (!response.ok) {
    const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const nested =
      record.error && typeof record.error === "object"
        ? (record.error as Record<string, unknown>)
        : undefined;
    throw new GymApiError(
      typeof nested?.code === "string" ? nested.code : `HTTP_${response.status}`,
      response.status,
      typeof nested?.message === "string" ? nested.message : "The request could not be completed.",
    );
  }
  return value as T;
}
