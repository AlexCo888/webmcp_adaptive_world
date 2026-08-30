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
  type AccessGrant,
  type DigitalPassport,
} from "@adaptive-world/contracts";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { db } from "./database";
import { isDemoResetOperator } from "./demo-reset-authorization";
import { parsePersistedDigitalPassport } from "./persisted-passport";
import { listSavedRoutines, type SavedRoutineSummary } from "./saved-routines";

export type PortalActor = {
  id: string;
  authSubject: string;
  email: string;
  displayName: string;
  role: "owner" | "doctor";
};

export type DoctorPassportView = {
  kind: "doctor-passport-view";
  id: string;
  displayName: string;
  ageYears: number;
  functional: DigitalPassport["functional"];
  clinical: {
    biologicalSex: DigitalPassport["identity"]["biologicalSex"];
    heightCm: number;
    weightKg: number;
    vitalSigns: Array<
      Pick<
        DigitalPassport["vitalSigns"][number],
        "code" | "label" | "value" | "unit" | "observedAt" | "interpretation" | "sourceId"
      >
    >;
    conditions: Array<
      Pick<DigitalPassport["conditions"][number], "id" | "label" | "status" | "sourceId">
    >;
    medications: DigitalPassport["medications"];
    allergies: DigitalPassport["allergies"];
    notableResults: Array<
      Pick<
        DigitalPassport["notableResults"][number],
        "code" | "label" | "value" | "unit" | "observedAt" | "interpretation" | "sourceId"
      >
    >;
  } | null;
  documents: Array<
    Pick<
      DigitalPassport["documents"][number],
      "id" | "title" | "kind" | "issuedAt" | "sourceId" | "synthetic"
    >
  >;
  updatedAt: string;
  synthetic: true;
};

export type PortalPassport = DigitalPassport | DoctorPassportView;

export type PortalBootstrap = {
  actor: PortalActor;
  passports: PortalPassport[];
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
  savedRoutines: SavedRoutineSummary[];
  demoResetEnabled: boolean;
};

export async function getActorFromHeaders(requestHeaders: Headers): Promise<PortalActor | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
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

export async function getOptionalActor(): Promise<PortalActor | null> {
  return getActorFromHeaders(await headers());
}

export async function requireActor(expected?: PortalActor["role"]): Promise<PortalActor> {
  const actor = await getOptionalActor();
  if (!actor) redirect("/sign-in");
  if (expected && actor.role !== expected) redirect(actor.role === "doctor" ? "/doctor" : "/");
  return actor;
}

function mapGrant(
  row: typeof accessGrants.$inferSelect,
  passportId: string,
  now = new Date(),
): AccessGrant {
  const status =
    row.status === "active" && row.expiresAt.getTime() <= now.getTime() ? "expired" : row.status;
  return AccessGrantSchema.parse({
    id: row.id,
    passportId,
    granteeId: row.granteeUserId,
    granteeType: "clinician",
    scopes: row.scopes,
    status,
    purpose: row.purpose,
    issuedAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString(),
  });
}

function ageInYears(dateOfBirth: string, now: Date): number {
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function projectDoctorPassport(
  passport: DigitalPassport,
  scopes: ReadonlySet<string>,
  now: Date,
): DoctorPassportView {
  const clinical = scopes.has("passport.clinical.read");
  const documents = scopes.has("passport.documents.read");
  return {
    kind: "doctor-passport-view",
    id: passport.id,
    displayName: passport.identity.displayName,
    ageYears: ageInYears(passport.identity.dateOfBirth, now),
    functional: passport.functional,
    clinical: clinical
      ? {
          biologicalSex: passport.identity.biologicalSex,
          heightCm: passport.heightCm,
          weightKg: passport.weightKg,
          vitalSigns: passport.vitalSigns.map(
            ({ code, label, value, unit, observedAt, interpretation, sourceId }) => ({
              code,
              label,
              value,
              unit,
              observedAt,
              interpretation,
              sourceId,
            }),
          ),
          conditions: passport.conditions.map(({ id, label, status, sourceId }) => ({
            id,
            label,
            status,
            sourceId,
          })),
          notableResults: passport.notableResults.map(
            ({ code, label, value, unit, observedAt, interpretation, sourceId }) => ({
              code,
              label,
              value,
              unit,
              observedAt,
              interpretation,
              sourceId,
            }),
          ),
          medications: passport.medications,
          allergies: passport.allergies,
        }
      : null,
    documents: documents
      ? passport.documents.map(({ id, title, kind, issuedAt, sourceId, synthetic }) => ({
          id,
          title,
          kind,
          issuedAt,
          sourceId,
          synthetic,
        }))
      : [],
    updatedAt: passport.updatedAt,
    synthetic: true,
  };
}

function canResetDemo(actor: PortalActor): boolean {
  return process.env.ENABLE_DEMO_RESET === "true" && isDemoResetOperator(actor);
}

export async function loadPortalBootstrap(actor: PortalActor): Promise<PortalBootstrap> {
  if (actor.role === "owner") {
    const [owned] = await db
      .select()
      .from(patients)
      .where(eq(patients.ownerUserId, actor.id))
      .limit(1);
    if (!owned) throw new Error("No Passport is linked to this account.");
    const passport = parsePersistedDigitalPassport(owned.profile);
    const [grantRows, eventRows, guidanceRows, routineRows] = await Promise.all([
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
      listSavedRoutines(actor),
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
      savedRoutines: routineRows,
      demoResetEnabled: canResetDemo(actor),
    };
  }

  const now = new Date();
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
        gt(accessGrants.expiresAt, now),
        eq(doctorPatientRelationships.doctorUserId, actor.id),
        eq(doctorPatientRelationships.patientId, accessGrants.patientId),
        eq(doctorPatientRelationships.status, "active"),
        isNull(doctorPatientRelationships.revokedAt),
        or(
          isNull(doctorPatientRelationships.expiresAt),
          gt(doctorPatientRelationships.expiresAt, now),
        ),
      ),
    );

  const grouped = new Map<
    string,
    {
      passport: DigitalPassport;
      grants: Array<typeof accessGrants.$inferSelect>;
      scopes: Set<string>;
    }
  >();
  for (const { patient, grant } of rows) {
    const passport = parsePersistedDigitalPassport(patient.profile);
    const existing = grouped.get(passport.id) ?? {
      passport,
      grants: [],
      scopes: new Set<string>(),
    };
    existing.grants.push(grant);
    for (const scope of grant.scopes) existing.scopes.add(scope);
    grouped.set(passport.id, existing);
  }
  const authorized = [...grouped.values()].filter(({ scopes }) =>
    scopes.has("passport.summary.read"),
  );

  return {
    actor,
    passports: authorized.map(({ passport, scopes }) =>
      projectDoctorPassport(passport, scopes, now),
    ),
    grants: authorized.flatMap(({ passport, grants }) =>
      grants.map((grant) => mapGrant(grant, passport.id)),
    ),
    auditEvents: [],
    guidance: [],
    savedRoutines: [],
    demoResetEnabled: canResetDemo(actor),
  };
}
