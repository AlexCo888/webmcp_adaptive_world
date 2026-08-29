import { GymContextProjectionSchema, type GymContextProjection } from "@adaptive-world/contracts";
import { contextGrants, gymSessions } from "@adaptive-world/db/schema";
import { signDemoToken, verifyDemoToken, type GymProjection } from "@adaptive-world/security";
import { and, eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "./database";
import { GYM_CONTEXT_READ_SCOPE, hasRequiredGymScopes } from "./gym-scopes";
import { toPublicGymProjectionId } from "./public-identifiers";
export { toPublicGymRoutineId } from "./public-identifiers";

export const GYM_SESSION_COOKIE = "aw_gym_session";
const issuer = "adaptive-world-gym";
const audience = "adaptive-gym-browser";
const tokenType = "gym-member-session";

type CookieData = { sessionId: string; subjectId: string };
type StoredProjection = { version: 1; profile: GymProjection; validUntil: string };

export async function createGymCookieToken(sessionId: string, subjectId: string) {
  return signDemoToken<CookieData>({
    issuer,
    audience,
    subject: subjectId,
    type: tokenType,
    data: { sessionId, subjectId },
    ttlSeconds: 60 * 60 * 24,
  });
}

export async function getGymSession(requiredScopes: readonly string[] = [GYM_CONTEXT_READ_SCOPE]) {
  const token = (await cookies()).get(GYM_SESSION_COOKIE)?.value;
  if (!token) return null;
  const claims = await verifyDemoToken<CookieData>(token, { issuer, audience, type: tokenType });
  if (
    !claims ||
    typeof claims.data.sessionId !== "string" ||
    typeof claims.data.subjectId !== "string"
  ) {
    return null;
  }
  const [result] = await db
    .select({ session: gymSessions, grant: contextGrants })
    .from(gymSessions)
    .innerJoin(contextGrants, eq(gymSessions.contextGrantId, contextGrants.id))
    .where(
      and(
        eq(gymSessions.id, claims.data.sessionId),
        eq(gymSessions.anonymousSubjectId, claims.data.subjectId),
        eq(contextGrants.audience, "adaptive-gym"),
        eq(contextGrants.redeemedBySessionId, gymSessions.id),
        eq(contextGrants.patientId, gymSessions.patientId),
        sql`${contextGrants.redeemedAt} IS NOT NULL`,
        sql`${contextGrants.revokedAt} IS NULL`,
        sql`${contextGrants.expiresAt} > now()`,
      ),
    )
    .limit(1);
  if (!result) return null;
  const { session: row, grant } = result;
  if (!hasRequiredGymScopes(grant.scopes, requiredScopes)) return null;
  const stored = row.contextProjection as StoredProjection;
  if (
    !stored?.profile ||
    Date.parse(stored.validUntil) <= Date.now() ||
    stored.validUntil !== grant.expiresAt.toISOString()
  ) {
    return null;
  }
  return { row, grant, subjectId: claims.data.subjectId, stored };
}

export function toPublicGymContext(
  stored: StoredProjection,
  sessionId: string,
): GymContextProjection {
  const experienceLevel = GymContextProjectionSchema.shape.experienceLevel.parse(
    stored.profile.experienceLevel,
  );
  const preferred = stored.profile.preferredSessionMinutes;
  const preferredMinutes = preferred ? Math.round((preferred.min + preferred.max) / 2) : 45;
  return GymContextProjectionSchema.parse({
    projectionId: toPublicGymProjectionId(sessionId),
    subjectAlias: "Passport member",
    purpose: stored.profile.purpose,
    goals: stored.profile.goals,
    experienceLevel,
    preferredSessionMinutes: preferredMinutes,
    preferredActivities: stored.profile.preferredActivities ?? [],
    functionalCapabilities: stored.profile.functionalCapabilities ?? [],
    movementConsiderations: stored.profile.movementConsiderations ?? [],
    avoid: stored.profile.avoid ?? [],
    stopSignals: stored.profile.stopSignals ?? [],
    accessibilityNeeds: stored.profile.accessibilityNeeds ?? [],
    sourceCategories: stored.profile.sourceCategories ?? [],
    issuedAt: stored.profile.generatedAt,
    expiresAt: stored.validUntil,
    synthetic: true,
  });
}
