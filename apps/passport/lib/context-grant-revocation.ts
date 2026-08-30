import { sql, type SQL } from "drizzle-orm";
import { db } from "./database";

type SqlRow = Record<string, unknown>;
type Executor = <T extends SqlRow>(query: SQL) => Promise<{ rows: T[] }>;

type RevokedRow = {
  grant_id: string;
  session_cancelled: boolean;
};

const executeDatabase: Executor = async <T extends SqlRow>(query: SQL) => db.execute<T>(query);

/**
 * Revokes an owner-controlled Gym handoff while preserving the shared patient
 * lock order used by redemption and demo reset. Session cancellation and audit
 * insertion are part of the same PostgreSQL statement.
 */
export async function revokeOwnerGymContextGrant(
  input: { ownerUserId: string; grantId: string; requestId: string },
  execute: Executor = executeDatabase,
): Promise<{ grantId: string; sessionCancelled: boolean } | null> {
  const result = await execute<RevokedRow>(sql`
    WITH selected_patient AS MATERIALIZED (
      SELECT patient_row.id
      FROM patients AS patient_row
      WHERE patient_row.owner_user_id = ${input.ownerUserId}::uuid
      LIMIT 1
      FOR UPDATE OF patient_row
    ), revoked_grant AS (
      UPDATE context_grants AS grant_row
      SET revoked_at = now(), revoked_by_user_id = ${input.ownerUserId}::uuid
      FROM selected_patient
      WHERE grant_row.id = ${input.grantId}::uuid
        AND grant_row.patient_id = selected_patient.id
        AND grant_row.created_by_user_id = ${input.ownerUserId}::uuid
        AND grant_row.revoked_at IS NULL
        AND grant_row.expires_at > now()
      RETURNING grant_row.id, grant_row.patient_id, grant_row.redeemed_by_session_id
    ), cancelled_session AS (
      UPDATE gym_sessions AS session_row
      SET status = 'cancelled', updated_at = now()
      FROM revoked_grant
      WHERE session_row.id = revoked_grant.redeemed_by_session_id
        AND session_row.context_grant_id = revoked_grant.id
        AND session_row.patient_id = revoked_grant.patient_id
        AND session_row.status IN ('draft', 'confirmed')
      RETURNING session_row.id
    ), audit AS (
      INSERT INTO audit_events (
        actor_user_id,
        patient_id,
        action,
        resource_type,
        resource_id,
        outcome,
        request_id,
        metadata
      )
      SELECT
        ${input.ownerUserId}::uuid,
        revoked_grant.patient_id,
        'gym.context_grant.revoked',
        'context_grant',
        revoked_grant.id,
        'success',
        ${input.requestId},
        jsonb_build_object(
          'audience', 'adaptive-gym',
          'sessionCancelled', EXISTS (SELECT 1 FROM cancelled_session)
        )
      FROM revoked_grant
      RETURNING 1
    )
    SELECT
      revoked_grant.id AS grant_id,
      EXISTS (SELECT 1 FROM cancelled_session) AS session_cancelled
    FROM revoked_grant
    CROSS JOIN audit
  `);
  const revoked = result.rows[0];
  return revoked
    ? { grantId: revoked.grant_id, sessionCancelled: revoked.session_cancelled }
    : null;
}
