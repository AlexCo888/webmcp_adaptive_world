import { z } from "zod";
import { apiError, apiSuccess, readJson, requestId, requireApiActor } from "@/lib/api";
import { commitClinicalGuidanceIfLive } from "@/lib/guidance-write";

const InputSchema = z
  .object({
    patientId: z.string().trim().min(1).max(128),
    guidance: z.string().trim().min(1).max(2_000),
    expiresAt: z.string().datetime().optional(),
  })
  .strict();

export async function POST(request: Request) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, "doctor", currentRequestId);
  if (authorization.response) return authorization.response;
  const actor = authorization.actor;
  const input = await readJson(request, InputSchema);
  if (!input.success) return apiError("VALIDATION", "Invalid guidance.", 400, currentRequestId);
  const expiresAt = input.data.expiresAt
    ? new Date(input.data.expiresAt)
    : new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000);
  if (expiresAt <= new Date() || expiresAt > new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000)) {
    return apiError(
      "VALIDATION",
      "Guidance expiry must be within one year.",
      400,
      currentRequestId,
    );
  }
  const saved = await commitClinicalGuidanceIfLive({
    doctorUserId: actor.id,
    passportId: input.data.patientId,
    guidance: input.data.guidance,
    expiresAt,
    requestId: currentRequestId,
  });
  if (!saved) {
    return apiError(
      "NOT_FOUND",
      "No currently authorized patient matched the request.",
      404,
      currentRequestId,
    );
  }
  return apiSuccess(
    {
      saved: true,
      guidanceId: saved.id,
      expiresAt: expiresAt.toISOString(),
    },
    currentRequestId,
    201,
  );
}
