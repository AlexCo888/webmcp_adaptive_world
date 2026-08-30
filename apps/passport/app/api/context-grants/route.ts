import { createContextGrantStore } from "@adaptive-world/db";
import { auditEvents } from "@adaptive-world/db/schema";
import { RoutineGoalSchema } from "@adaptive-world/contracts";
import { issueContextGrant } from "@adaptive-world/security";
import { z } from "zod";
import { apiError, apiSuccess, readJson, requestId, requireApiActor } from "@/lib/api";
import { prepareLockedGymContextGrant } from "@/lib/context-grant-preparation";
import { transactionalDb } from "@/lib/database";
import { GYM_CONTEXT_SCOPES } from "@/lib/gym-projection";

export const ContextGrantInputSchema = z
  .object({
    goal: RoutineGoalSchema,
    expiresInMinutes: z.number().int().min(1).max(15).default(5),
    preparationToken: z.string().min(80).max(2_048),
  })
  .strict();

export { resolveContextGrantTiming } from "@/lib/context-grant-preparation";

export async function POST(request: Request) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, "owner", currentRequestId);
  if (authorization.response) return authorization.response;
  const actor = authorization.actor;
  const input = await readJson(request, ContextGrantInputSchema);
  if (!input.success) {
    return apiError("VALIDATION", "Invalid Gym goal or exchange lifetime.", 400, currentRequestId);
  }
  const issuance = await transactionalDb.transaction(async (tx) => {
    const preparation = await prepareLockedGymContextGrant(
      {
        actorId: actor.id,
        requestedRoutineGoal: input.data.goal,
        expiresInMinutes: input.data.expiresInMinutes,
        preparationToken: input.data.preparationToken,
      },
      async (query) => tx.execute(query),
    );
    if (preparation.kind !== "ready") return preparation;

    const { patientId, timing, profile, purpose } = preparation;
    const created = await issueContextGrant(createContextGrantStore(tx), {
      patientId,
      createdByUserId: actor.id,
      audience: "adaptive-gym",
      purpose,
      scopes: [...GYM_CONTEXT_SCOPES],
      projection: { version: 1, profile, validUntil: profile.validUntil },
      ttlMs: timing.ttlMs,
      now: timing.issuedAt,
    });
    if (
      created.expiresAt.getTime() !== timing.expiresAt.getTime() ||
      created.expiresAt.toISOString() !== profile.validUntil
    ) {
      throw new Error("Context grant expiry invariant failed");
    }

    await tx.insert(auditEvents).values({
      actorUserId: actor.id,
      patientId,
      action: "gym.context_grant.created",
      resourceType: "context_grant",
      resourceId: created.id,
      outcome: "success",
      metadata: { audience: "adaptive-gym", expiresAt: created.expiresAt.toISOString() },
    });
    return { kind: "issued" as const, issued: created };
  });
  if (issuance.kind === "not_found") {
    return apiError("NOT_FOUND", "Passport not found.", 404, currentRequestId);
  }
  if (issuance.kind === "invalid_preparation") {
    return apiError(
      "CONFLICT",
      "The Gym projection changed or its confirmation expired. Review it again.",
      409,
      currentRequestId,
    );
  }
  const issued = issuance.issued;

  const gymUrl = process.env.NEXT_PUBLIC_GYM_URL ?? "http://127.0.0.1:3001";
  const response = apiSuccess(
    {
      exchangeUrl: `${gymUrl}/passport#code=${encodeURIComponent(issued.token)}`,
      expiresAt: issued.expiresAt.toISOString(),
      audience: "adaptive-gym" as const,
      scopes: GYM_CONTEXT_SCOPES,
    },
    currentRequestId,
    201,
  );
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
