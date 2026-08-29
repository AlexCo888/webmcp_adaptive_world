import { contextGrants, gymSessions } from "@adaptive-world/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { revokeGymSessionAuthority } from "@/lib/disconnect-session";
import { getGymSession, GYM_SESSION_COOKIE, toPublicGymContext } from "@/lib/gym-session";

export async function GET() {
  const session = await getGymSession();
  if (!session) {
    return NextResponse.json(
      { active: false },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      active: true,
      projection: toPublicGymContext(session.stored, session.row.id),
      scopes: session.grant.scopes,
      session: { status: session.row.status },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function DELETE() {
  const session = await getGymSession();
  let revoked = false;
  if (session) {
    revoked = await revokeGymSessionAuthority(
      {
        grantId: session.grant.id,
        sessionId: session.row.id,
        subjectId: session.subjectId,
      },
      {
        revokeContextGrant: async (target, now) => {
          const revokedRows = await db
            .update(contextGrants)
            .set({ revokedAt: now })
            .where(
              and(
                eq(contextGrants.id, target.grantId),
                eq(contextGrants.redeemedBySessionId, target.sessionId),
                isNull(contextGrants.revokedAt),
              ),
            )
            .returning({ id: contextGrants.id });
          return revokedRows.length === 1;
        },
        cancelSession: async (target, now) => {
          await db
            .update(gymSessions)
            .set({ status: "cancelled", updatedAt: now })
            .where(
              and(
                eq(gymSessions.id, target.sessionId),
                eq(gymSessions.anonymousSubjectId, target.subjectId),
                inArray(gymSessions.status, ["draft", "confirmed"]),
              ),
            );
        },
      },
    );
  }
  const response = NextResponse.json({ disconnected: true, revoked });
  response.cookies.set(GYM_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
