import {
  accessGrants,
  auditEvents,
  clinicalGuidance,
  doctorPatientRelationships,
  patients,
  users,
} from "@adaptive-world/db/schema";
import {
  AccessGrantSchema,
  DigitalPassportSchema,
  type AccessGrant,
  type DigitalPassport,
} from "@adaptive-world/contracts";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./database";

export type PortalActor = {
  id: string;
  authSubject: string;
  email: string;
  displayName: string;
  role: "owner" | "doctor";
};

export type PortalBootstrap = {
  actor: PortalActor;
  passports: DigitalPassport[];
  grants: AccessGrant[];
  auditEvents: Array<{
    id: string;
    action: string;
    outcome: "success" | "denied" | "error";
    occurredAt: string;
    metadata: Record<string, unknown>;
  }>;
  guidance: Array<{
    id: string;
    doctorName: string;
    guidance: string;
    createdAt: string;
    expiresAt: string;
  }>;
};

export async function getOptionalActor(): Promise<PortalActor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user.id) return null;
  const [actor] = await db
    .select()
    .from(users)
    .where(and(eq(users.authSubject, session.user.id), isNull(users.disabledAt)))
    .limit(1);
  if (!actor || (actor.role !== "patient" && actor.role !== "doctor")) return null;
  return {
    id: actor.id,
    authSubject: actor.authSubject,
    email: actor.email,
    displayName: actor.displayName,
    role: actor.role === "doctor" ? "doctor" : "owner",
  };
}

export async function requireActor(expected?: PortalActor["role"]): Promise<PortalActor> {
  const actor = await getOptionalActor();
  if (!actor) redirect("/sign-in");
  if (expected && actor.role !== expected) redirect(actor.role === "doctor" ? "/doctor" : "/");
  return actor;
}

function mapGrant(row: typeof accessGrants.$inferSelect, passportId: string): AccessGrant {
  return AccessGrantSchema.parse({
    id: row.id,
    passportId,
    granteeId: row.granteeUserId,
    granteeType: "clinician",
    scopes: row.scopes,
    status: row.status,
    purpose: row.purpose,
    issuedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString(),
  });
}

export async function loadPortalBootstrap(actor: PortalActor): Promise<PortalBootstrap> {
  if (actor.role === "owner") {
    const [owned] = await db
      .select()
      .from(patients)
      .where(eq(patients.ownerUserId, actor.id))
      .limit(1);
    if (!owned) throw new Error("No Passport is linked to this account.");
    const passport = DigitalPassportSchema.parse(owned.profile);
    const [grantRows, eventRows, guidanceRows] = await Promise.all([
      db.select().from(accessGrants).where(eq(accessGrants.patientId, owned.id)),
      db
        .select()
        .from(auditEvents)
        .where(or(eq(auditEvents.patientId, owned.id), eq(auditEvents.actorUserId, actor.id)))
        .orderBy(sql`${auditEvents.occurredAt} desc`)
        .limit(50),
      db
        .select({ guidance: clinicalGuidance, doctorName: users.displayName })
        .from(clinicalGuidance)
        .innerJoin(users, eq(clinicalGuidance.doctorUserId, users.id))
        .where(
          and(
            eq(clinicalGuidance.patientId, owned.id),
            isNull(clinicalGuidance.revokedAt),
            gt(clinicalGuidance.expiresAt, new Date()),
          ),
        )
        .orderBy(sql`${clinicalGuidance.createdAt} desc`)
        .limit(10),
    ]);
    return {
      actor,
      passports: [passport],
      grants: grantRows.map((grant) => mapGrant(grant, passport.id)),
      auditEvents: eventRows.map((event) => ({
        id: event.id,
        action: event.action,
        outcome: event.outcome,
        occurredAt: event.occurredAt.toISOString(),
        metadata: event.metadata as Record<string, unknown>,
      })),
      guidance: guidanceRows.map(({ guidance, doctorName }) => ({
        id: guidance.id,
        doctorName,
        guidance: guidance.guidance,
        createdAt: guidance.createdAt.toISOString(),
        expiresAt: guidance.expiresAt.toISOString(),
      })),
    };
  }

  const rows = await db
    .select({ patient: patients, grant: accessGrants })
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
        sql`${accessGrants.scopes} @> '["passport.summary.read"]'::jsonb`,
      ),
    );

  return {
    actor,
    passports: rows.map(({ patient }) => DigitalPassportSchema.parse(patient.profile)),
    grants: rows.map(({ patient, grant }) => {
      const passport = DigitalPassportSchema.parse(patient.profile);
      return mapGrant(grant, passport.id);
    }),
    auditEvents: [],
    guidance: [],
  };
}
