import { z } from "zod";
import { revokeCanonicalDoctorGrant } from "@/lib/access-grant-write";
import { apiError, apiSuccess, requestId, requireApiActor } from "@/lib/api";

const GrantIdSchema = z.string().uuid();

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, "owner", currentRequestId);
  if (authorization.response) return authorization.response;
  const actor = authorization.actor;
  const parsedId = GrantIdSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return apiError("VALIDATION", "Invalid permission identifier.", 400, currentRequestId);
  }
  const id = parsedId.data;
  const revoked = await revokeCanonicalDoctorGrant({
    ownerUserId: actor.id,
    grantId: id,
    requestId: currentRequestId,
  });
  if (!revoked) {
    return apiError("NOT_FOUND", "Active permission not found.", 404, currentRequestId);
  }
  return apiSuccess({ revoked: true as const, grantId: revoked.grantId }, currentRequestId);
}
