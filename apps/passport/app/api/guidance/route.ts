import {
  accessGrants,
  auditEvents,
  clinicalGuidance,
  doctorPatientRelationships,
  patients,
} from "@adaptive-world/db/schema";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/database";
import { requireActor } from "@/lib/session";

const InputSchema = z.object({
  patientId: z.string().min(1).max(128),
  guidance: z.string().min(1).max(2_000),
  expiresAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const actor = await requireActor("doctor");
  const input = InputSchema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "Invalid guidance." }, { status: 400 });
  const expiresAt = input.data.expiresAt
    ? new Date(input.data.expiresAt)
    : new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000);
  if (expiresAt <= new Date() || expiresAt > new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000)) {
    return NextResponse.json(
      { error: "Guidance expiry must be within one year." },
      { status: 400 },
    );
  }
  const [authorized] = await db
    .select({
      patientId: patients.id,
      grantId: accessGrants.id,
      relationshipId: doctorPatientRelationships.id,
    })
    .from(accessGrants)
    .innerJoin(patients, eq(accessGrants.patientId, patients.id))
    .innerJoin(
      doctorPatientRelationships,
      eq(accessGrants.relationshipId, doctorPatientRelationships.id),
    )
    .where(
      and(
        eq(accessGrants.granteeUserId, actor.id),
        eq(accessGrants.status, "active"),
        isNull(accessGrants.revokedAt),
        gt(accessGrants.expiresAt, new Date()),
        eq(doctorPatientRelationships.doctorUserId, actor.id),
        eq(doctorPatientRelationships.status, "active"),
        isNull(doctorPatientRelationships.revokedAt),
        or(
          isNull(doctorPatientRelationships.expiresAt),
          gt(doctorPatientRelationships.expiresAt, new Date()),
        ),
        sql`${accessGrants.scopes} @> '["passport.guidance.write"]'::jsonb`,
        sql`${patients.profile}->>'id' = ${input.data.patientId}`,
      ),
    )
    .limit(1);
  if (!authorized) return NextResponse.json({ error: "Missing guidance scope." }, { status: 403 });

  const [saved] = await db
    .insert(clinicalGuidance)
    .values({
      patientId: authorized.patientId,
      doctorUserId: actor.id,
      relationshipId: authorized.relationshipId,
      accessGrantId: authorized.grantId,
      guidance: input.data.guidance,
      expiresAt,
    })
    .returning({ id: clinicalGuidance.id });
  if (!saved) return NextResponse.json({ error: "Guidance could not be saved." }, { status: 500 });

  await db.insert(auditEvents).values({
    actorUserId: actor.id,
    patientId: authorized.patientId,
    action: "clinical_guidance.confirmed",
    resourceType: "clinical_guidance",
    resourceId: saved.id,
    outcome: "success",
    metadata: {
      guidanceSha256: createHash("sha256").update(input.data.guidance).digest("hex"),
      characterCount: input.data.guidance.length,
      expiresAt: expiresAt.toISOString(),
      syntheticDemo: true,
    },
  });
  return NextResponse.json({
    saved: true,
    guidanceId: saved.id,
    expiresAt: expiresAt.toISOString(),
  });
}
