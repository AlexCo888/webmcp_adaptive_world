import { z } from "zod";
import { apiError, apiSuccess, readJson, requestId, requireApiActor } from "@/lib/api";
import { DemoResetError, resetSyntheticDemo } from "@/lib/demo-reset";

export const runtime = "nodejs";

const InputSchema = z.object({}).strict();

export async function POST(request: Request) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, "doctor", currentRequestId);
  if (authorization.response) return authorization.response;
  const input = await readJson(request, InputSchema);
  if (!input.success) {
    return apiError("VALIDATION", "The reset request must be empty.", 400, currentRequestId);
  }
  try {
    const result = await resetSyntheticDemo(authorization.actor, currentRequestId);
    return apiSuccess({ restored: true as const, ...result }, currentRequestId);
  } catch (error) {
    if (error instanceof DemoResetError) {
      return apiError(error.code, error.message, error.status, currentRequestId);
    }
    return apiError(
      "UNAVAILABLE",
      "The synthetic demo could not be restored.",
      503,
      currentRequestId,
    );
  }
}
