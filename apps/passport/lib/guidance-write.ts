import { createHash } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { db } from "./database";

type SqlRow = Record<string, unknown>;

export type GuidanceSqlExecutor = <T extends SqlRow>(query: SQL) => Promise<{ rows: T[] }>;

export type LiveGuidanceWrite = {
  doctorUserId: string;
  passportId: string;
  guidance: string;
  expiresAt: Date;
  requestId: string;
};

export type SavedGuidance = {
  id: string;
  patientId: string;
};

const executeDatabase: GuidanceSqlExecutor = async <T extends SqlRow>(query: SQL) =>
  db.execute<T>(query);

/**
 * Authorizes, writes, and audits clinical guidance in one PostgreSQL statement.
 * Locking the exact grant and relationship makes revocation linearizable with
 * the write rather than leaving a check-then-insert window.
 */
export async function commitClinicalGuidanceIfLive(
  input: LiveGuidanceWrite,
  execute: GuidanceSqlExecutor = executeDatabase,
): Promise<SavedGuidance | null> {
  const metadata = {
    guidanceSha256: createHash("sha256").update(input.guidance).digest("hex"),
    characterCount: input.guidance.length,
    expiresAt: input.expiresAt.toISOString(),
    syntheticDemo: true,
  };
  const result = await execute<{ guidance_id: string; patient_id: string }>(sql`
    WITH selected_patient AS MATERIALIZED (
      SELECT patient_row.id
      FROM patients AS patient_row
      WHERE patient_row.profile->>'id' = ${input.passportId}
      LIMIT 1
      FOR UPDATE OF patient_row
    ), authorized AS MATERIALIZED (
      SELECT
        selected_patient.id AS patient_id,
        grant_row.id AS grant_id,
        relationship_row.id AS relationship_id
      FROM access_grants AS grant_row
      INNER JOIN selected_patient
        ON selected_patient.id = grant_row.patient_id
      INNER JOIN doctor_patient_relationships AS relationship_row
        ON relationship_row.id = grant_row.relationship_id
      WHERE grant_row.grantee_user_id = ${input.doctorUserId}::uuid
        AND grant_row.status = 'active'
        AND grant_row.revoked_at IS NULL
        AND grant_row.expires_at > now()
        AND grant_row.scopes @> '["passport.guidance.write"]'::jsonb
        AND relationship_row.doctor_user_id = ${input.doctorUserId}::uuid
        AND relationship_row.patient_id = grant_row.patient_id
        AND relationship_row.status = 'active'
        AND relationship_row.revoked_at IS NULL
        AND (
          relationship_row.expires_at IS NULL
          OR relationship_row.expires_at > now()
        )
      ORDER BY grant_row.created_at DESC, grant_row.id DESC
      LIMIT 1
      FOR UPDATE OF grant_row, relationship_row
    ), saved AS (
      INSERT INTO clinical_guidance (
        patient_id,
        doctor_user_id,
        relationship_id,
        access_grant_id,
        guidance,
        expires_at,
        created_at,
        updated_at
      )
      SELECT
        authorized.patient_id,
        ${input.doctorUserId}::uuid,
        authorized.relationship_id,
        authorized.grant_id,
        ${input.guidance},
        ${input.expiresAt},
        now(),
        now()
      FROM authorized
      RETURNING id, patient_id
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
        ${input.doctorUserId}::uuid,
        saved.patient_id,
        'clinical_guidance.confirmed',
        'clinical_guidance',
        saved.id,
        'success',
        ${input.requestId},
        ${JSON.stringify(metadata)}::jsonb,
        now()
      FROM saved
      RETURNING resource_id
    )
    SELECT saved.id AS guidance_id, saved.patient_id
    FROM saved
    INNER JOIN audited ON audited.resource_id = saved.id
  `);
  const row = result.rows[0];
  return row ? { id: row.guidance_id, patientId: row.patient_id } : null;
}
