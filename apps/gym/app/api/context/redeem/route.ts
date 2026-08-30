import { auditEvents, contextGrants } from "@adaptive-world/db/schema";
import { hashOpaqueToken, type GymProjection } from "@adaptive-world/security";
import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { transactionalDb } from "@/lib/database";
import { createGymCookieToken, GYM_SESSION_COOKIE, toPublicGymContext } from "@/lib/gym-session";

const RequestSchema = z.object({ code: z.string().trim().min(32).max(160) });

type RedeemedRow = {
  gym_session_id: string;
  anonymous_subject_id: string;
  grant_id: string;
  patient_id: string;
  projection: { version: 1; profile: GymProjection; validUntil: string };
};

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a valid one-use context code." }, { status: 400 });
  }

  try {
    const subjectId = crypto.randomUUID();
    const tokenHash = await hashOpaqueToken(parsed.data.code);
    const result = await transactionalDb.transaction(async (tx) => {
      const rows = await tx.execute<RedeemedRow>(sql`
        select * from redeem_context_grant_session(
          ${tokenHash}::varchar,
          ${"adaptive-gym"}::varchar,
          ${subjectId}::uuid
        )
      `);
      const redeemed = rows.rows[0];
      if (!redeemed) return null;

      await tx.insert(auditEvents).values({
        patientId: redeemed.patient_id,
        action: "gym.context_grant.redeemed",
        resourceType: "gym_session",
        resourceId: redeemed.gym_session_id,
        outcome: "success",
        requestId,
        metadata: { audience: "adaptive-gym", anonymousSession: true },
      });
      const [grant] = await tx
        .select({ scopes: contextGrants.scopes })
        .from(contextGrants)
        .where(eq(contextGrants.id, redeemed.grant_id))
        .limit(1);
      if (!grant) throw new Error("Redeemed context grant was not readable in its transaction");
      const cookieToken = await createGymCookieToken(redeemed.gym_session_id, subjectId);
      return { redeemed, scopes: grant.scopes, cookieToken };
    });

    if (!result) {
      return NextResponse.json(
        { error: "This context code is invalid, expired, revoked, or already used." },
        { status: 409, headers: { "cache-control": "no-store" } },
      );
    }

    const publicContext = toPublicGymContext(
      result.redeemed.projection,
      result.redeemed.gym_session_id,
    );
    const response = NextResponse.json({
      projection: publicContext,
      scopes: result.scopes,
      redeemed: true,
    });
    response.cookies.set(GYM_SESSION_COOKIE, result.cookieToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "no-referrer");
    return response;
  } catch (error) {
    const cause =
      error && typeof error === "object" && "cause" in error
        ? (error as { cause?: unknown }).cause
        : undefined;
    const databaseCode =
      cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code?: unknown }).code)
        : undefined;
    console.error("[gym.context.redeem] transaction failed", {
      requestId,
      errorName: error instanceof Error ? error.name : "UnknownError",
      databaseCode,
    });
    return NextResponse.json(
      {
        error:
          "The Gym could not finish opening the private session. Return to Passport, verify the handoff status, and create a new one if needed.",
        requestId,
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
