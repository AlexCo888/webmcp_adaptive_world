import { createContextGrantStore } from "@adaptive-world/db";
import { auditEvents, patients } from "@adaptive-world/db/schema";
import { buildGymProjection, issueContextGrant } from "@adaptive-world/security";
import { DigitalPassportSchema } from "@adaptive-world/contracts";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/database";
import { requireActor } from "@/lib/session";

const InputSchema = z.object({ expiresInMinutes: z.number().int().min(1).max(15).default(5) });

function ageBand(dateOfBirth: string) {
  const years = Math.floor((Date.now() - new Date(dateOfBirth).getTime()) / 31_557_600_000);
  if (years < 30) return "18-29";
  if (years < 45) return "30-44";
  if (years < 65) return "45-64";
  return "65+";
}

export async function POST(request: Request) {
  const actor = await requireActor("owner");
  const input = InputSchema.safeParse(await request.json());
  if (!input.success)
    return NextResponse.json({ error: "Invalid exchange lifetime." }, { status: 400 });
  const [patientRow] = await db
    .select()
    .from(patients)
    .where(eq(patients.ownerUserId, actor.id))
    .limit(1);
  if (!patientRow) return NextResponse.json({ error: "Passport not found." }, { status: 404 });
  const passport = DigitalPassportSchema.parse(patientRow.profile);
  const profile = buildGymProjection({
    ageBand: ageBand(passport.identity.dateOfBirth),
    goals: passport.functional.goals,
    experienceLevel: passport.functional.experienceLevel,
    preferredActivities: passport.functional.preferredActivities,
    preferredSessionMinutes: {
      min: Math.max(15, passport.functional.preferredSessionMinutes - 10),
      max: passport.functional.preferredSessionMinutes + 10,
    },
    functionalCapabilities: [
      `${passport.functional.weeklyActivityMinutes} weekly activity minutes reported`,
    ],
    movementConsiderations: passport.functional.movementConsiderations,
    stopSignals: passport.functional.stopSignals,
    accessibilityNeeds: passport.functional.accessibilityNeeds,
    sourceCategories: ["self_reported", "clinician_guidance"],
  });
  const issued = await issueContextGrant(createContextGrantStore(db), {
    patientId: patientRow.id,
    createdByUserId: actor.id,
    audience: "adaptive-gym",
    purpose: "Match a staff-authored Gym walkthrough to approved movement context",
    scopes: ["gym.context.read"],
    projection: { version: 1, profile, validUntil: profile.validUntil },
    ttlMs: input.data.expiresInMinutes * 60_000,
  });

  await db.insert(auditEvents).values({
    actorUserId: actor.id,
    patientId: patientRow.id,
    action: "gym.context_grant.created",
    resourceType: "context_grant",
    resourceId: issued.id,
    outcome: "success",
    metadata: { audience: "adaptive-gym", expiresAt: issued.expiresAt.toISOString() },
  });

  const gymUrl = process.env.NEXT_PUBLIC_GYM_URL ?? "http://127.0.0.1:3001";
  const response = NextResponse.json({
    exchangeUrl: `${gymUrl}/passport#code=${encodeURIComponent(issued.token)}`,
    expiresAt: issued.expiresAt.toISOString(),
  });
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
