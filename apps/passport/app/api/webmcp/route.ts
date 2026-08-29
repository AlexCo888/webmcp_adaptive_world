import { apiError, apiSuccess, readJson, requestId, requireApiActor } from "@/lib/api";
import {
  executePassportWebMcp,
  PassportWebMcpError,
  PassportWebMcpRequestSchema,
} from "@/lib/webmcp-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, undefined, currentRequestId);
  if (authorization.response) return authorization.response;

  const parsed = await readJson(request, PassportWebMcpRequestSchema);
  if (!parsed.success) {
    return apiError("VALIDATION", "The Passport tool request was invalid.", 400, currentRequestId);
  }

  try {
    const data = await executePassportWebMcp(authorization.actor, parsed.data, {
      requestId: currentRequestId,
    });
    return apiSuccess(data, currentRequestId);
  } catch (error) {
    if (error instanceof PassportWebMcpError) {
      return apiError(error.code, error.message, error.status, currentRequestId);
    }
    return apiError(
      "UNAVAILABLE",
      "The Passport tool is temporarily unavailable.",
      503,
      currentRequestId,
    );
  }
}
