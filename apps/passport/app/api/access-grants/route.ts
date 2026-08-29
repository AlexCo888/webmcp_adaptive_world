import { AccessGrantSchema, PassportScopeSchema } from "@adaptive-world/contracts";
import { z } from "zod";
import { upsertCanonicalDoctorGrant } from "@/lib/access-grant-write";
import { apiError, apiSuccess, readJson, requestId, requireApiActor } from "@/lib/api";

const InputSchema = z
  .object({
    scopes: z
      .array(PassportScopeSchema)
      .min(1)
      .max(4)
      .refine((items) => items.every((scope) => scope.startsWith("passport."))),
    days: z.number().int().min(1).max(90),
  })
  .strict();

export async function POST(request: Request) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, "owner", currentRequestId);
  if (authorization.response) return authorization.response;
  const actor = authorization.actor;
  const input = await readJson(request, InputSchema);
  if (!input.success) {
    return apiError("VALIDATION", "Invalid permission request.", 400, currentRequestId);
  }

  const expiresAt = new Date(Date.now() + input.data.days * 86_400_000);
  const grant = await upsertCanonicalDoctorGrant({
    ownerUserId: actor.id,
    scopes: input.data.scopes,
    expiresAt,
    requestId: currentRequestId,
  });
  if (!grant) {
    return apiError("UNAVAILABLE", "Demo actors are not seeded.", 503, currentRequestId);
  }

  return apiSuccess(
    {
      grant: AccessGrantSchema.parse({
        id: grant.id,
        passportId: grant.passportId,
        granteeId: grant.granteeUserId,
        granteeType: "clinician",
        scopes: grant.scopes,
        status: grant.status,
        purpose: grant.purpose,
        issuedAt: grant.issuedAt.toISOString(),
        expiresAt: grant.expiresAt.toISOString(),
      }),
    },
    currentRequestId,
    201,
  );
}
