import { z } from "zod";
import { apiError, apiSuccess, requestId, requireApiActor } from "@/lib/api";
import { revokeOwnerGymContextGrant } from "@/lib/context-grant-revocation";

const GrantIdSchema = z.string().uuid();

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, "owner", currentRequestId);
  if (authorization.response) return authorization.response;
  const parsedId = GrantIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return apiError("VALIDATION", "Invalid Gym handoff identifier.", 400, currentRequestId);
  }
  const revoked = await revokeOwnerGymContextGrant({
    ownerUserId: authorization.actor.id,
    grantId: parsedId.data,
    requestId: currentRequestId,
  });
  if (!revoked) {
    return apiError("NOT_FOUND", "Active Gym handoff not found.", 404, currentRequestId);
  }
  return apiSuccess(
    {
      revoked: true as const,
      grantId: revoked.grantId,
      sessionCancelled: revoked.sessionCancelled,
    },
    currentRequestId,
  );
}
