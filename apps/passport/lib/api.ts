import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import type { PortalActor } from "./session";
import { getActorFromHeaders } from "./session";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "EXPIRED"
  | "CONFLICT"
  | "UNAVAILABLE";

const MAX_JSON_BODY_CHARS = 16_384;

export function requestId(request: Request): string {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && supplied.length <= 128 ? supplied : crypto.randomUUID();
}

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  currentRequestId: string,
) {
  return NextResponse.json(
    { ok: false, error: { code, message }, meta: { requestId: currentRequestId } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function apiSuccess<T>(data: T, currentRequestId: string, status = 200) {
  return NextResponse.json(
    {
      ok: true,
      data,
      meta: {
        synthetic: true,
        asOf: new Date().toISOString(),
        requestId: currentRequestId,
      },
    },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<{ success: true; data: T } | { success: false }> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return { success: false };

  try {
    const body = await request.text();
    if (body.length > MAX_JSON_BODY_CHARS) return { success: false };
    const parsed = schema.safeParse(JSON.parse(body) as unknown);
    return parsed.success ? { success: true, data: parsed.data } : { success: false };
  } catch {
    return { success: false };
  }
}

export async function requireApiActor(
  request: Request,
  expected: PortalActor["role"] | undefined,
  currentRequestId: string,
): Promise<{ actor: PortalActor; response?: never } | { actor?: never; response: NextResponse }> {
  let actor: PortalActor | null;
  try {
    actor = await getActorFromHeaders(request.headers);
  } catch {
    return {
      response: apiError(
        "UNAVAILABLE",
        "Passport authorization is temporarily unavailable.",
        503,
        currentRequestId,
      ),
    };
  }
  if (!actor) {
    return {
      response: apiError(
        "UNAUTHENTICATED",
        "A valid Passport session is required.",
        401,
        currentRequestId,
      ),
    };
  }
  if (expected && actor.role !== expected) {
    return {
      response: apiError(
        "FORBIDDEN",
        "This account cannot perform the requested operation.",
        403,
        currentRequestId,
      ),
    };
  }
  return { actor };
}
