import { sql, type SQL } from "drizzle-orm";

export type CanonicalDemoGrantSeed = {
  grantId: string;
  patientId: string;
  granteeUserId: string;
  relationshipId: string;
  createdByUserId: string;
  purpose: string;
  scopes: readonly string[];
  expiresAt: Date;
};

/**
 * Restores the deterministic demo authority without racing the live-authority
 * partial unique index. The patient row is the serialization point shared with
 * normal grant writes. Any replacement live row is revoked before the fixed
 * seed row is inserted or reactivated.
 */
export function buildCanonicalDemoGrantSeedStatement(input: CanonicalDemoGrantSeed): SQL {
  const scopes = [...new Set(input.scopes)].sort();
  return sql`
    WITH selected_patient AS MATERIALIZED (
      SELECT patient_row.id
      FROM patients AS patient_row
      WHERE patient_row.id = ${input.patientId}::uuid
        AND patient_row.owner_user_id = ${input.createdByUserId}::uuid
        AND patient_row.synthetic_demo = true
      FOR UPDATE OF patient_row
    ), revoked_replacements AS (
      UPDATE access_grants AS grant_row
      SET
        status = 'revoked',
        revoked_at = now(),
        revoked_by_user_id = grant_row.created_by_user_id,
        updated_at = now()
      FROM selected_patient
      WHERE grant_row.patient_id = selected_patient.id
        AND grant_row.grantee_user_id = ${input.granteeUserId}::uuid
        AND grant_row.id <> ${input.grantId}::uuid
        AND grant_row.status = 'active'
        AND grant_row.revoked_at IS NULL
      RETURNING grant_row.id
    ), revocation_barrier AS MATERIALIZED (
      SELECT count(*) AS revoked_count FROM revoked_replacements
    ), canonical_grant AS (
      INSERT INTO access_grants (
        id,
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
        ${input.grantId}::uuid,
        selected_patient.id,
        ${input.granteeUserId}::uuid,
        ${input.relationshipId}::uuid,
        ${input.createdByUserId}::uuid,
        ${input.purpose},
        'active',
        ${JSON.stringify(scopes)}::jsonb,
        ${input.expiresAt},
        NULL,
        NULL,
        now(),
        now()
      FROM selected_patient
      CROSS JOIN revocation_barrier
      ON CONFLICT (id) DO UPDATE SET
        patient_id = EXCLUDED.patient_id,
        grantee_user_id = EXCLUDED.grantee_user_id,
        relationship_id = EXCLUDED.relationship_id,
        created_by_user_id = EXCLUDED.created_by_user_id,
        purpose = EXCLUDED.purpose,
        status = 'active',
        scopes = EXCLUDED.scopes,
        expires_at = EXCLUDED.expires_at,
        revoked_at = NULL,
        revoked_by_user_id = NULL,
        updated_at = now()
      RETURNING id
    )
    SELECT id FROM canonical_grant
  `;
}
