import type { PassportScope } from "@adaptive-world/contracts";
import { sql, type SQL } from "drizzle-orm";
import { db } from "./database";

type SqlRow = Record<string, unknown>;

export type AccessGrantSqlExecutor = <T extends SqlRow>(query: SQL) => Promise<{ rows: T[] }>;

export type CanonicalAccessGrant = {
  id: string;
  passportId: string;
  granteeUserId: string;
  scopes: PassportScope[];
  status: "active";
  purpose: string;
  issuedAt: Date;
  expiresAt: Date;
};

type CanonicalGrantRow = {
  id: string;
  passport_id: string;
  grantee_user_id: string;
  scopes: unknown;
  status: "active";
  purpose: string;
  issued_at: Date | string;
  expires_at: Date | string;
};

const DEMO_DOCTOR_EMAIL = "elena.vargas@adaptiveworld.test";
const ACCESS_PURPOSE = "Authorized clinical review in the Adaptive World demo";

const executeDatabase: AccessGrantSqlExecutor = async <T extends SqlRow>(query: SQL) =>
  db.execute<T>(query);

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function parseScopes(value: unknown): PassportScope[] {
  if (!Array.isArray(value) || !value.every((scope) => typeof scope === "string")) {
    throw new TypeError("Canonical access-grant scopes were invalid.");
  }
  return value as PassportScope[];
}

/**
 * Creates or replaces the one canonical active authority for this patient and
 * clinician. Relationship activation, grant upsert, and audit insertion are a
 * single PostgreSQL statement, so provider/network failure cannot commit only
 * the authority-bearing row. The partial unique index is the concurrent backstop.
 */
export async function upsertCanonicalDoctorGrant(
  input: {
    ownerUserId: string;
    scopes: readonly PassportScope[];
    expiresAt: Date;
    requestId: string;
  },
  execute: AccessGrantSqlExecutor = executeDatabase,
): Promise<CanonicalAccessGrant | null> {
  const scopes = [...new Set(input.scopes)].sort();
  const result = await execute<CanonicalGrantRow>(sql`
    WITH selected_patient AS MATERIALIZED (
      SELECT patient_row.id, patient_row.profile->>'id' AS passport_id
      FROM patients AS patient_row
      WHERE patient_row.owner_user_id = ${input.ownerUserId}::uuid
      LIMIT 1
      FOR UPDATE
    ), selected_doctor AS MATERIALIZED (
      SELECT doctor_row.id
      FROM users AS doctor_row
      WHERE lower(doctor_row.email) = lower(${DEMO_DOCTOR_EMAIL})
        AND doctor_row.role = 'doctor'
        AND doctor_row.disabled_at IS NULL
      LIMIT 1
    ), relationship AS (
      INSERT INTO doctor_patient_relationships (
        patient_id,
        doctor_user_id,
        status,
        invited_by_user_id,
        activated_at,
        expires_at,
        revoked_at,
        created_at,
        updated_at
      )
      SELECT
        selected_patient.id,
        selected_doctor.id,
        'active',
        ${input.ownerUserId}::uuid,
        now(),
        ${input.expiresAt},
        NULL,
        now(),
        now()
      FROM selected_patient
      CROSS JOIN selected_doctor
      ON CONFLICT (patient_id, doctor_user_id) DO UPDATE SET
        status = 'active',
        invited_by_user_id = EXCLUDED.invited_by_user_id,
        activated_at = EXCLUDED.activated_at,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL,
        updated_at = now()
      RETURNING id, patient_id, doctor_user_id
    ), canonical_grant AS (
      INSERT INTO access_grants (
        patient_id,
        grantee_user_id,
        relationship_id,
        created_by_user_id,
        purpose,
        status,
        scopes,
        expires_at,
        revoked_at,
        revoked_by_user_id,
        created_at,
        updated_at
      )
      SELECT
        relationship.patient_id,
        relationship.doctor_user_id,
        relationship.id,
        ${input.ownerUserId}::uuid,
        ${ACCESS_PURPOSE},
        'active',
        ${JSON.stringify(scopes)}::jsonb,
        ${input.expiresAt},
        NULL,
        NULL,
        now(),
        now()
      FROM relationship
      ON CONFLICT (patient_id, grantee_user_id)
        WHERE status = 'active' AND revoked_at IS NULL
      DO UPDATE SET
        relationship_id = EXCLUDED.relationship_id,
        created_by_user_id = EXCLUDED.created_by_user_id,
        purpose = EXCLUDED.purpose,
        status = 'active',
        scopes = EXCLUDED.scopes,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL,
        revoked_by_user_id = NULL,
        created_at = EXCLUDED.created_at,
        updated_at = now()
      RETURNING
        id,
        patient_id,
        grantee_user_id,
        scopes,
        status,
        purpose,
        created_at,
        expires_at
    ), audited AS (
      INSERT INTO audit_events (
        actor_user_id,
        patient_id,
        action,
        resource_type,
        resource_id,
        outcome,
        request_id,
        metadata,
        occurred_at
      )
      SELECT
        ${input.ownerUserId}::uuid,
        canonical_grant.patient_id,
        'doctor.access_grant.created',
        'access_grant',
        canonical_grant.id,
        'success',
        ${input.requestId},
        jsonb_build_object(
          'canonical', true,
          'scopes', canonical_grant.scopes,
          'expiresAt', canonical_grant.expires_at
        ),
        now()
      FROM canonical_grant
      RETURNING resource_id
    )
    SELECT
      canonical_grant.id,
      selected_patient.passport_id,
      canonical_grant.grantee_user_id,
      canonical_grant.scopes,
      canonical_grant.status,
      canonical_grant.purpose,
      canonical_grant.created_at AS issued_at,
      canonical_grant.expires_at
    FROM canonical_grant
    INNER JOIN selected_patient ON selected_patient.id = canonical_grant.patient_id
    INNER JOIN audited ON audited.resource_id = canonical_grant.id
  `);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    passportId: row.passport_id,
    granteeUserId: row.grantee_user_id,
    scopes: parseScopes(row.scopes),
    status: row.status,
    purpose: row.purpose,
    issuedAt: asDate(row.issued_at),
    expiresAt: asDate(row.expires_at),
  };
}

/** Revokes every legacy-equivalent live row and records that transition atomically. */
export async function revokeCanonicalDoctorGrant(
  input: { ownerUserId: string; grantId: string; requestId: string },
  execute: AccessGrantSqlExecutor = executeDatabase,
): Promise<{ grantId: string; revokedCount: number } | null> {
  const result = await execute<{ grant_id: string; revoked_count: number | string }>(sql`
    WITH selected_patient AS MATERIALIZED (
      SELECT patient_row.id
      FROM patients AS patient_row
      INNER JOIN access_grants AS requested_grant
        ON requested_grant.patient_id = patient_row.id
      WHERE requested_grant.id = ${input.grantId}::uuid
        AND patient_row.owner_user_id = ${input.ownerUserId}::uuid
      LIMIT 1
      FOR UPDATE OF patient_row
    ), target AS MATERIALIZED (
      SELECT
        grant_row.id,
        grant_row.patient_id,
        grant_row.grantee_user_id
      FROM access_grants AS grant_row
      INNER JOIN selected_patient ON selected_patient.id = grant_row.patient_id
      WHERE grant_row.id = ${input.grantId}::uuid
        AND grant_row.status = 'active'
        AND grant_row.revoked_at IS NULL
      LIMIT 1
      FOR UPDATE OF grant_row
    ), revoked AS (
      UPDATE access_grants AS grant_row
      SET
        status = 'revoked',
        revoked_at = now(),
        revoked_by_user_id = ${input.ownerUserId}::uuid,
        updated_at = now()
      FROM target
      WHERE grant_row.patient_id = target.patient_id
        AND grant_row.grantee_user_id = target.grantee_user_id
        AND grant_row.status = 'active'
        AND grant_row.revoked_at IS NULL
      RETURNING grant_row.id
    ), revoked_summary AS (
      SELECT target.id AS grant_id, target.patient_id, count(revoked.id)::integer AS revoked_count
      FROM target
      INNER JOIN revoked ON true
      GROUP BY target.id, target.patient_id
    ), audited AS (
      INSERT INTO audit_events (
        actor_user_id,
        patient_id,
        action,
        resource_type,
        resource_id,
        outcome,
        request_id,
        metadata,
        occurred_at
      )
      SELECT
        ${input.ownerUserId}::uuid,
        revoked_summary.patient_id,
        'doctor.access_grant.revoked',
        'access_grant',
        revoked_summary.grant_id,
        'success',
        ${input.requestId},
        jsonb_build_object('revokedGrantCount', revoked_summary.revoked_count),
        now()
      FROM revoked_summary
      RETURNING resource_id
    )
    SELECT
      revoked_summary.grant_id,
      revoked_summary.revoked_count
    FROM revoked_summary
    INNER JOIN audited ON audited.resource_id = revoked_summary.grant_id
  `);
  const row = result.rows[0];
  return row ? { grantId: row.grant_id, revokedCount: Number(row.revoked_count) } : null;
}
