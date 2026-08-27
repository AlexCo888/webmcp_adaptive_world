import { AccessGrantSchema, PassportScopeSchema } from "@adaptive-world/contracts";
import {
  accessGrants,
  auditEvents,
  doctorPatientRelationships,
  patients,
  users,
} from "@adaptive-world/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/database";
import { requireActor } from "@/lib/session";

const InputSchema = z.object({
  scopes: z
    .array(PassportScopeSchema)
    .min(1)
    .refine((items) => items.every((scope) => scope.startsWith("passport."))),
  days: z.number().int().min(1).max(90),
});

export async function POST(request: Request) {
  const actor = await requireActor("owner");
  const input = InputSchema.safeParse(await request.json());
  if (!input.success)
    return NextResponse.json({ error: "Invalid permission request." }, { status: 400 });

  const [patient] = await db
    .select()
    .from(patients)
    .where(eq(patients.ownerUserId, actor.id))
    .limit(1);
  const [doctor] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, "elena.vargas@adaptiveworld.test"), eq(users.role, "doctor")))
    .limit(1);
  if (!patient || !doctor)
    return NextResponse.json({ error: "Demo actors are not seeded." }, { status: 503 });

  let [relationship] = await db
    .select()
    .from(doctorPatientRelationships)
    .where(
      and(
        eq(doctorPatientRelationships.patientId, patient.id),
        eq(doctorPatientRelationships.doctorUserId, doctor.id),
      ),
    )
    .limit(1);
  const expiresAt = new Date(Date.now() + input.data.days * 86_400_000);
  if (!relationship) {
    [relationship] = await db
      .insert(doctorPatientRelationships)
      .values({
        patientId: patient.id,
        doctorUserId: doctor.id,
        invitedByUserId: actor.id,
        status: "active",
        activatedAt: new Date(),
        expiresAt,
      })
      .returning();
  } else {
    [relationship] = await db
      .update(doctorPatientRelationships)
      .set({ status: "active", activatedAt: new Date(), expiresAt, revokedAt: null })
      .where(eq(doctorPatientRelationships.id, relationship.id))
      .returning();
  }

  const [grant] = await db
    .insert(accessGrants)
    .values({
      patientId: patient.id,
      granteeUserId: doctor.id,
      relationshipId: relationship.id,
      createdByUserId: actor.id,
      purpose: "Authorized clinical review in the Adaptive World demo",
      scopes: input.data.scopes,
      expiresAt,
    })
    .returning();
  if (!grant) return NextResponse.json({ error: "Permission was not created." }, { status: 500 });

  await db.insert(auditEvents).values({
    actorUserId: actor.id,
    patientId: patient.id,
    action: "doctor.access_grant.created",
    resourceType: "access_grant",
    resourceId: grant.id,
    outcome: "success",
    metadata: { scopes: grant.scopes, expiresAt: grant.expiresAt.toISOString() },
  });

  return NextResponse.json({
    grant: AccessGrantSchema.parse({
      id: grant.id,
      passportId: (patient.profile as { id: string }).id,
      granteeId: doctor.id,
      granteeType: "clinician",
      scopes: grant.scopes,
      status: grant.status,
      purpose: grant.purpose,
      issuedAt: grant.createdAt.toISOString(),
      expiresAt: grant.expiresAt.toISOString(),
    }),
  });
}
