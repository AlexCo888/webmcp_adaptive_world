import type { GeneratedSession, SessionFeedback } from "@adaptive-world/contracts";
import { sql, type SQL } from "drizzle-orm";
import { db } from "./database";
import { GYM_CONTEXT_READ_SCOPE, GYM_FEEDBACK_WRITE_SCOPE } from "./gym-scopes";

type SqlRow = Record<string, unknown>;

export type ConditionalSqlExecutor = <T extends SqlRow>(query: SQL) => Promise<{ rows: T[] }>;

export type LiveFeedbackWrite = {
  grantId: string;
  internalSessionId: string;
  anonymousSubjectId: string;
  plan: GeneratedSession;
  feedback: SessionFeedback;
};

const executeDatabase: ConditionalSqlExecutor = async <T extends SqlRow>(query: SQL) =>
  db.execute<T>(query);

/**
 * Rechecks the grant, scopes, redemption binding, projection lifetime, and exact
 * plan in the same PostgreSQL statement that persists feedback. Row locks make
 * this linearizable with grant revocation: either this statement commits first,
 * or a completed revocation makes the authorized CTE empty.
 */
export async function commitSessionFeedbackIfLive(
  input: LiveFeedbackWrite,
  execute: ConditionalSqlExecutor = executeDatabase,
): Promise<boolean> {
  const completedExerciseIds = [...new Set(input.feedback.completedExerciseIds)];
  const completed = completedExerciseIds.length === input.plan.exercises.length;
  const exerciseFeedback = completedExerciseIds.map((equipmentId) => ({
    equipmentId,
    completed: true,
  }));
  const requiredScopes = [GYM_CONTEXT_READ_SCOPE, GYM_FEEDBACK_WRITE_SCOPE];
  const result = await execute<{ gym_session_id: string }>(sql`
    WITH selected_patient AS MATERIALIZED (
      SELECT patient_row.id
      FROM patients AS patient_row
      INNER JOIN context_grants AS requested_grant
        ON requested_grant.patient_id = patient_row.id
      WHERE requested_grant.id = ${input.grantId}::uuid
      LIMIT 1
      FOR UPDATE OF patient_row
    ), live_grant AS MATERIALIZED (
      SELECT
        grant_row.id,
        grant_row.patient_id,
        grant_row.redeemed_by_session_id,
        grant_row.expires_at
      FROM context_grants AS grant_row
      INNER JOIN selected_patient ON selected_patient.id = grant_row.patient_id
      WHERE grant_row.id = ${input.grantId}::uuid
        AND grant_row.audience = 'adaptive-gym'
        AND grant_row.redeemed_at IS NOT NULL
        AND grant_row.revoked_at IS NULL
        AND grant_row.expires_at > now()
        AND grant_row.scopes @> ${JSON.stringify(requiredScopes)}::jsonb
      LIMIT 1
      FOR UPDATE OF grant_row
    ), authorized AS MATERIALIZED (
      SELECT session_row.id, session_row.anonymous_subject_id
      FROM gym_sessions AS session_row
      INNER JOIN live_grant
        ON live_grant.id = session_row.context_grant_id
      WHERE session_row.id = ${input.internalSessionId}::uuid
        AND session_row.anonymous_subject_id = ${input.anonymousSubjectId}::uuid
        AND session_row.status IN ('draft', 'confirmed', 'completed')
        AND session_row.plan = ${JSON.stringify(input.plan)}::jsonb
        AND live_grant.patient_id = session_row.patient_id
        AND live_grant.redeemed_by_session_id = session_row.id
        AND (session_row.context_projection->>'validUntil')::timestamptz > now()
        AND (session_row.context_projection->>'validUntil')::timestamptz = live_grant.expires_at
      FOR UPDATE OF session_row
    ), feedback_write AS (
      INSERT INTO session_feedback (
        session_id,
        anonymous_subject_id,
        perceived_exertion,
        pain_after,
        completed,
        notes,
        exercise_feedback,
        created_at
      )
      SELECT
        authorized.id,
        authorized.anonymous_subject_id,
        ${input.feedback.perceivedEffort},
        ${input.feedback.painDuringSession},
        ${completed},
        ${input.feedback.notes ?? null},
        ${JSON.stringify(exerciseFeedback)}::jsonb,
        now()
      FROM authorized
      ON CONFLICT (session_id, anonymous_subject_id) DO UPDATE SET
        perceived_exertion = EXCLUDED.perceived_exertion,
        pain_after = EXCLUDED.pain_after,
        completed = EXCLUDED.completed,
        notes = EXCLUDED.notes,
        exercise_feedback = EXCLUDED.exercise_feedback
      RETURNING session_id
    ), session_write AS (
      UPDATE gym_sessions AS session_row
      SET status = 'completed', completed_at = now(), updated_at = now()
      FROM feedback_write
      WHERE session_row.id = feedback_write.session_id
      RETURNING session_row.id AS gym_session_id
    )
    SELECT gym_session_id FROM session_write
  `);
  return result.rows.length === 1;
}
