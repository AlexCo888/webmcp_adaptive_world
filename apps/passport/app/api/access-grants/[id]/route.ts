import { accessGrants, auditEvents, patients } from "@adaptive-world/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { requireActor } from "@/lib/session";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireActor("owner");
  const { id } = await context.params;
  const [ownedGrant] = await db
    .select({ id: accessGrants.id, patientId: accessGrants.patientId })
    .from(accessGrants)
    .innerJoin(patients, eq(accessGrants.patientId, patients.id))
    .where(
      and(
        eq(accessGrants.id, id),
        eq(patients.ownerUserId, actor.id),
        eq(accessGrants.status, "active"),
      ),
    )
    .limit(1);
  if (!ownedGrant)
    return NextResponse.json({ error: "Active permission not found." }, { status: 404 });

  await db
    .update(accessGrants)
    .set({ status: "revoked", revokedAt: new Date(), revokedByUserId: actor.id })
    .where(eq(accessGrants.id, ownedGrant.id));
  await db.insert(auditEvents).values({
    actorUserId: actor.id,
    patientId: ownedGrant.patientId,
    action: "doctor.access_grant.revoked",
    resourceType: "access_grant",
    resourceId: ownedGrant.id,
    outcome: "success",
  });
  return NextResponse.json({ revoked: true });
}
