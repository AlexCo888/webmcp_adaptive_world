import { GymContextProjectionSchema, type GymContextProjection } from "@adaptive-world/contracts";
import { gymSessions } from "@adaptive-world/db/schema";
import { signDemoToken, verifyDemoToken, type GymProjection } from "@adaptive-world/security";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "./database";

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

export async function getGymSession() {
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
  const [row] = await db
    .select()
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.id, claims.data.sessionId),
        eq(gymSessions.anonymousSubjectId, claims.data.subjectId),
      ),
    )
    .limit(1);
  if (!row) return null;
  const stored = row.contextProjection as StoredProjection;
  if (!stored?.profile || Date.parse(stored.validUntil) <= Date.now()) return null;
  return { row, subjectId: claims.data.subjectId, stored };
}

export function toPublicGymContext(
  stored: StoredProjection,
  sessionId: string,
): GymContextProjection {
  const preferred = stored.profile.preferredSessionMinutes;
  const preferredMinutes = preferred ? Math.round((preferred.min + preferred.max) / 2) : 45;
  return GymContextProjectionSchema.parse({
    projectionId: `gym_session_${sessionId}`,
    subjectAlias: "Passport member",
    ageBand: stored.profile.ageBand ?? "Adult",
    goals: stored.profile.goals ?? [],
    experienceLevel: stored.profile.experienceLevel ?? "not specified",
    preferredSessionMinutes: preferredMinutes,
    preferredActivities: stored.profile.preferredActivities ?? [],
    movementConsiderations: stored.profile.movementConsiderations ?? [],
    stopSignals: stored.profile.stopSignals ?? [],
    accessibilityNeeds: stored.profile.accessibilityNeeds ?? [],
    issuedAt: stored.profile.generatedAt,
    expiresAt: stored.validUntil,
    synthetic: true,
  });
}
