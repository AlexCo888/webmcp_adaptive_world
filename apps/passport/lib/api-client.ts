"use client";

import { WebMCPToolError } from "@adaptive-world/webmcp";
import { z, type ZodType } from "zod";
import type { ApiErrorCode } from "./api";

const MAX_API_RESPONSE_CHARS = 32_768;

const ApiErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION",
  "EXPIRED",
  "CONFLICT",
  "UNAVAILABLE",
]);

const SuccessEnvelopeSchema = z
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

const ErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1).max(240),
      })
      .strict(),
    meta: z.object({ requestId: z.string().min(1).max(128) }).strict(),
  })
  .strict();

export class PassportApiClientError extends WebMCPToolError {
  constructor(code: ApiErrorCode, message: string) {
    super(code, message);
    this.name = "PassportApiClientError";
  }
}

export async function readPassportApiResponse<T>(
  response: Response,
  dataSchema: ZodType<T>,
  fallback: string,
): Promise<T> {
  const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new PassportApiClientError("UNAVAILABLE", fallback);
  }

  const text = await response.text();
  if (text.length > MAX_API_RESPONSE_CHARS) {
    throw new PassportApiClientError("UNAVAILABLE", fallback);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new PassportApiClientError("UNAVAILABLE", fallback);
  }

  if (!response.ok) {
    const parsed = ErrorEnvelopeSchema.safeParse(payload);
    if (!parsed.success) throw new PassportApiClientError("UNAVAILABLE", fallback);
    throw new PassportApiClientError(parsed.data.error.code, parsed.data.error.message);
  }

  const envelope = SuccessEnvelopeSchema.safeParse(payload);
  if (!envelope.success) throw new PassportApiClientError("UNAVAILABLE", fallback);
  const data = dataSchema.safeParse(envelope.data.data);
  if (!data.success) throw new PassportApiClientError("UNAVAILABLE", fallback);
  return data.data;
}
