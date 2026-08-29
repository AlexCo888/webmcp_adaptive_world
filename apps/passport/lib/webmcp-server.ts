import {
  DigitalPassportSchema,
  type DigitalPassport,
  type PassportScope,
} from "@adaptive-world/contracts";
import {
  accessGrants,
  auditEvents,
  doctorPatientRelationships,
  patients,
} from "@adaptive-world/db/schema";
import { and, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { ContextGrantToolInputSchema } from "./context-grant-contract";
import { prepareGymContextGrant } from "./context-grant-preparation";
import { db } from "./database";
import type { ApiErrorCode } from "./api";
import type { PortalActor } from "./session";

const PatientIdSchema = z.string().min(1).max(128);
const EmptyInputSchema = z.object({}).strict();
const SummaryInputSchema = z
  .object({
    sections: z
      .array(z.enum(["profile", "health", "mobility", "goals"]))
      .max(4)
      .optional(),
  })
  .strict();
const SharesInputSchema = z
  .object({ status: z.enum(["active", "expired", "revoked", "all"]).default("active") })
  .strict();
const SearchInputSchema = z
  .object({
    query: z.string().max(100).default(""),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .strict();
const PatientInputSchema = z.object({ patientId: PatientIdSchema }).strict();
const SectionInputSchema = z
  .object({
    patientId: PatientIdSchema,
    section: z.enum(["summary", "medications", "allergies", "labs", "mobility", "documents"]),
  })
  .strict();
const SourceInputSchema = z
  .object({ patientId: PatientIdSchema, sourceId: z.string().min(1).max(128) })
  .strict();

export const PassportWebMcpRequestSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("get_my_passport_summary"), input: SummaryInputSchema }).strict(),
  z.object({ tool: z.literal("list_my_shares"), input: SharesInputSchema }).strict(),
  z
    .object({ tool: z.literal("prepare_context_grant"), input: ContextGrantToolInputSchema })
    .strict(),
  z.object({ tool: z.literal("search_my_patients"), input: SearchInputSchema }).strict(),
  z.object({ tool: z.literal("get_patient_overview"), input: PatientInputSchema }).strict(),
  z.object({ tool: z.literal("get_patient_section"), input: SectionInputSchema }).strict(),
  z.object({ tool: z.literal("open_patient_source"), input: SourceInputSchema }).strict(),
]);

export type PassportWebMcpRequest = z.infer<typeof PassportWebMcpRequestSchema>;

export class PassportWebMcpError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PassportWebMcpError";
  }
}

function requireRole(actor: PortalActor, role: PortalActor["role"]): void {
  if (actor.role !== role) {
    throw new PassportWebMcpError(
      "FORBIDDEN",
      "This account cannot use the requested Passport tool.",
      403,
    );
  }
}

function ageFrom(dateOfBirth: string, now: Date) {
  return Math.floor((now.getTime() - new Date(dateOfBirth).getTime()) / 31_557_600_000);
}

function concisePassport(passport: DigitalPassport, now: Date) {
  return {
    id: passport.id,
    profile: {
      displayName: passport.identity.displayName,
      age: ageFrom(passport.identity.dateOfBirth, now),
      heightCm: passport.heightCm,
      weightKg: passport.weightKg,
    },
    health: {
      conditions: passport.conditions.map(({ label, status }) => ({ label, status })),
      notableResults: passport.notableResults.map(({ label, value, unit, interpretation }) => ({
        label,
        value,
        unit,
        interpretation,
      })),
    },
    mobility: {
      considerations: passport.functional.movementConsiderations,
      accessibilityNeeds: passport.functional.accessibilityNeeds,
      stopSignals: passport.functional.stopSignals,
    },
    goals: passport.functional.goals,
    updatedAt: passport.updatedAt,
    synthetic: true,
  };
}

export function doctorPassportSummary(passport: DigitalPassport, now: Date) {
  return {
    id: passport.id,
    profile: {
      displayName: passport.identity.displayName,
      age: ageFrom(passport.identity.dateOfBirth, now),
    },
    mobility: {
      considerations: passport.functional.movementConsiderations,
      accessibilityNeeds: passport.functional.accessibilityNeeds,
      stopSignals: passport.functional.stopSignals,
    },
    goals: passport.functional.goals,
    updatedAt: passport.updatedAt,
    synthetic: true,
  };
}

function requiredScope(section: z.infer<typeof SectionInputSchema>["section"]): PassportScope {
  if (section === "documents") return "passport.documents.read";
  if (section === "summary" || section === "mobility") return "passport.summary.read";
  return "passport.clinical.read";
}

function activeDoctorConditions(actor: PortalActor, now: Date) {
  return [
    eq(accessGrants.granteeUserId, actor.id),
    eq(accessGrants.status, "active"),
    isNull(accessGrants.revokedAt),
    gt(accessGrants.expiresAt, now),
    eq(doctorPatientRelationships.doctorUserId, actor.id),
    eq(doctorPatientRelationships.patientId, accessGrants.patientId),
    eq(doctorPatientRelationships.status, "active"),
    isNull(doctorPatientRelationships.revokedAt),
    or(isNull(doctorPatientRelationships.expiresAt), gt(doctorPatientRelationships.expiresAt, now)),
  ] as const;
}

async function ownedPassport(
  actor: PortalActor,
): Promise<{ rowId: string; passport: DigitalPassport }> {
  const [row] = await db
    .select({ id: patients.id, profile: patients.profile })
    .from(patients)
    .where(eq(patients.ownerUserId, actor.id))
    .limit(1);
  if (!row) throw new PassportWebMcpError("NOT_FOUND", "Passport not found.", 404);
  return { rowId: row.id, passport: DigitalPassportSchema.parse(row.profile) };
}

async function authorizedDoctorPassport(
  actor: PortalActor,
  passportId: string,
  scope: PassportScope,
  now: Date,
): Promise<{ rowId: string; passport: DigitalPassport }> {
  const [row] = await db
    .select({ id: patients.id, profile: patients.profile })
    .from(accessGrants)
    .innerJoin(patients, eq(accessGrants.patientId, patients.id))
    .innerJoin(
      doctorPatientRelationships,
      eq(accessGrants.relationshipId, doctorPatientRelationships.id),
    )
    .where(
      and(
        ...activeDoctorConditions(actor, now),
        sql`${accessGrants.scopes} @> ${JSON.stringify([scope])}::jsonb`,
        sql`${patients.profile}->>'id' = ${passportId}`,
      ),
    )
    .limit(1);
  if (!row) {
    throw new PassportWebMcpError(
      "NOT_FOUND",
      "No currently authorized patient matched the request.",
      404,
    );
  }
  return { rowId: row.id, passport: DigitalPassportSchema.parse(row.profile) };
}

export async function executePassportWebMcp(
  actor: PortalActor,
  request: PassportWebMcpRequest,
  options: { now?: Date; requestId?: string } = {},
): Promise<unknown> {
  const now = options.now ?? new Date();

  switch (request.tool) {
    case "get_my_passport_summary": {
      requireRole(actor, "owner");
      const { passport } = await ownedPassport(actor);
      const summary = concisePassport(passport, now);
      if (!request.input.sections?.length) return summary;
      return Object.fromEntries(
        request.input.sections.map((section) => [section, summary[section]]),
      );
    }
    case "list_my_shares": {
      requireRole(actor, "owner");
      const { rowId, passport } = await ownedPassport(actor);
      const rows = await db.select().from(accessGrants).where(eq(accessGrants.patientId, rowId));
      return rows
        .map((grant) => {
          const status =
            grant.status === "active" && grant.expiresAt.getTime() <= now.getTime()
              ? "expired"
              : grant.status;
          return {
            id: grant.id,
            passportId: passport.id,
            granteeId: grant.granteeUserId,
            granteeType: "clinician",
            scopes: grant.scopes,
            status,
            purpose: grant.purpose,
            issuedAt: grant.createdAt.toISOString(),
            expiresAt: grant.expiresAt.toISOString(),
            ...(grant.revokedAt ? { revokedAt: grant.revokedAt.toISOString() } : {}),
          };
        })
        .filter((grant) => request.input.status === "all" || grant.status === request.input.status);
    }
    case "prepare_context_grant": {
      requireRole(actor, "owner");
      const { passport } = await ownedPassport(actor);
      return prepareGymContextGrant({
        passport,
        actorId: actor.id,
        expiresInMinutes: request.input.expiresInMinutes,
        now,
      });
    }
    case "search_my_patients": {
      requireRole(actor, "doctor");
      const normalized = request.input.query.trim();
      const rows = await db
        .select({ profile: patients.profile })
        .from(accessGrants)
        .innerJoin(patients, eq(accessGrants.patientId, patients.id))
        .innerJoin(
          doctorPatientRelationships,
          eq(accessGrants.relationshipId, doctorPatientRelationships.id),
        )
        .where(
          and(
            ...activeDoctorConditions(actor, now),
            sql`${accessGrants.scopes} @> '["passport.summary.read"]'::jsonb`,
            ...(normalized
              ? [ilike(sql`${patients.profile}->'identity'->>'displayName'`, `%${normalized}%`)]
              : []),
          ),
        )
        .limit(100);
      const deduplicated = new Map<string, ReturnType<typeof doctorPassportSummary>>();
      for (const row of rows) {
        const passport = DigitalPassportSchema.parse(row.profile);
        if (!deduplicated.has(passport.id)) {
          deduplicated.set(passport.id, doctorPassportSummary(passport, now));
        }
      }
      return [...deduplicated.values()].slice(0, request.input.limit).map((item) => ({
        id: item.id,
        displayName: item.profile.displayName,
        updatedAt: item.updatedAt,
      }));
    }
    case "get_patient_overview": {
      requireRole(actor, "doctor");
      const { passport } = await authorizedDoctorPassport(
        actor,
        request.input.patientId,
        "passport.summary.read",
        now,
      );
      return doctorPassportSummary(passport, now);
    }
    case "get_patient_section": {
      requireRole(actor, "doctor");
      const { passport } = await authorizedDoctorPassport(
        actor,
        request.input.patientId,
        requiredScope(request.input.section),
        now,
      );
      const sections = {
        summary: doctorPassportSummary(passport, now),
        medications: passport.medications,
        allergies: passport.allergies,
        labs: passport.notableResults,
        mobility: passport.functional,
        documents: passport.documents.map(({ id, title, kind, issuedAt, sourceId }) => ({
          id,
          title,
          kind,
          issuedAt,
          sourceId,
        })),
      };
      return {
        patientId: passport.id,
        section: request.input.section,
        data: sections[request.input.section],
      };
    }
    case "open_patient_source": {
      requireRole(actor, "doctor");
      const { rowId, passport } = await authorizedDoctorPassport(
        actor,
        request.input.patientId,
        "passport.documents.read",
        now,
      );
      const referenced = passport.documents.some(
        (document) => document.sourceId === request.input.sourceId,
      );
      const source = referenced
        ? passport.sources.find((item) => item.id === request.input.sourceId)
        : undefined;
      if (!source) {
        throw new PassportWebMcpError(
          "NOT_FOUND",
          "No currently authorized source matched the request.",
          404,
        );
      }
      await db.insert(auditEvents).values({
        actorUserId: actor.id,
        patientId: rowId,
        action: "document.opened",
        resourceType: "passport_source",
        outcome: "success",
        requestId: options.requestId,
        metadata: { sourceId: source.id, syntheticDemo: true },
      });
      return source;
    }
    default: {
      request satisfies never;
      throw new PassportWebMcpError("VALIDATION", "Unsupported Passport tool.", 400);
    }
  }
}

export const PassportWebMcpEmptyInputSchema = EmptyInputSchema;
