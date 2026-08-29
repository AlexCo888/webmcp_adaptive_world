"use client";

import { WebMCPToolError } from "@adaptive-world/webmcp";
import { z } from "zod";
import type { ApiErrorCode } from "./api";
import type { PassportWebMcpRequest } from "./webmcp-server";

const MAX_RESPONSE_CHARS = 32_768;
const SuccessSchema = z
  .object({
    ok: z.literal(true),
    data: z.unknown(),
    meta: z
      .object({
        synthetic: z.literal(true),
        asOf: z.string().datetime(),
        requestId: z.string().min(1).max(128),
      })
      .strict(),
  })
  .strict();
const ErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum([
          "UNAUTHENTICATED",
          "FORBIDDEN",
          "NOT_FOUND",
          "VALIDATION",
          "EXPIRED",
          "CONFLICT",
          "UNAVAILABLE",
        ]),
        message: z.string().min(1).max(240),
      })
      .strict(),
    meta: z.object({ requestId: z.string().min(1).max(128) }).strict(),
  })
  .strict();

export class PassportWebMcpClientError extends WebMCPToolError {
  constructor(code: ApiErrorCode, message: string) {
    super(code, message);
    this.name = "PassportWebMcpClientError";
  }
}

export async function callPassportWebMcp(
  request: PassportWebMcpRequest,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch("/api/webmcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
    signal,
  });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new PassportWebMcpClientError(
      "UNAVAILABLE",
      "The Passport returned an invalid response.",
    );
  }
  const text = await response.text();
  if (text.length > MAX_RESPONSE_CHARS) {
    throw new PassportWebMcpClientError("UNAVAILABLE", "The Passport response exceeded its limit.");
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new PassportWebMcpClientError("UNAVAILABLE", "The Passport returned invalid JSON.");
  }

  if (!response.ok) {
    const parsed = ErrorSchema.safeParse(json);
    if (!parsed.success) {
      throw new PassportWebMcpClientError("UNAVAILABLE", "The Passport request failed safely.");
    }
    throw new PassportWebMcpClientError(parsed.data.error.code, parsed.data.error.message);
  }
  const parsed = SuccessSchema.safeParse(json);
  if (!parsed.success) {
    throw new PassportWebMcpClientError(
      "UNAVAILABLE",
      "The Passport returned an invalid envelope.",
    );
  }
  return parsed.data.data;
}
