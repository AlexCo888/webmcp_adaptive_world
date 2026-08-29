import type { PoolClient } from "@adaptive-world/db";
import { GYM_CONTEXT_READ_SCOPE } from "../gym-scopes";
import { CommerceError } from "./http";

export type LiveGymSessionAuthority = Readonly<{
  anonymousSubjectId: string;
  contextGrantId: string;
  internalSessionId: string;
  patientId: string;
  projection: unknown;
  projectionValidUntil: string;
  requiredScopes?: readonly string[];
}>;

/**
 * Reauthorizes a connected Gym session at a consequential write boundary.
 *
 * The context grant is always locked before the Gym session, matching the
 * disconnect path's revoke-before-cancel order. If disconnect commits first,
 * the grant predicate fails and the write callback is never entered. If this
 * operation locks first, it linearizes before the later revocation.
 */
export async function withLockedLiveGymSessionAuthority<T>(
  client: PoolClient,
  authority: LiveGymSessionAuthority,
  operation: () => Promise<T>,
): Promise<T> {
  const validUntil = new Date(authority.projectionValidUntil);
  if (!Number.isFinite(validUntil.getTime())) throw new CommerceError("CONTEXT_EXPIRED");
  const requiredScopes = [
    ...new Set([GYM_CONTEXT_READ_SCOPE, ...(authority.requiredScopes ?? [])]),
  ];
  const projection = JSON.stringify(authority.projection);
  if (!projection) throw new CommerceError("CONTEXT_EXPIRED");

  const grant = await client.query<{ id: string }>(
    `SELECT id FROM context_grants
     WHERE id = $1 AND patient_id = $2 AND audience = 'adaptive-gym'
       AND redeemed_at IS NOT NULL AND redeemed_by_session_id = $3
       AND revoked_at IS NULL AND expires_at > now()
       AND expires_at = $5::timestamptz
       AND scopes @> $4::jsonb
       AND projection = $6::jsonb
       AND (projection->>'validUntil')::timestamptz = expires_at
     FOR UPDATE`,
    [
      authority.contextGrantId,
      authority.patientId,
      authority.internalSessionId,
      JSON.stringify(requiredScopes),
      authority.projectionValidUntil,
      projection,
    ],
  );
  if (grant.rowCount !== 1) throw new CommerceError("CONTEXT_EXPIRED");

  const session = await client.query<{ id: string }>(
    `SELECT id FROM gym_sessions
     WHERE id = $1 AND patient_id = $2 AND anonymous_subject_id = $3
       AND context_grant_id = $4
       AND status IN ('draft','confirmed','completed')
       AND context_projection = $6::jsonb
       AND (context_projection->>'validUntil')::timestamptz > now()
       AND (context_projection->>'validUntil')::timestamptz = $5::timestamptz
     FOR UPDATE`,
    [
      authority.internalSessionId,
      authority.patientId,
      authority.anonymousSubjectId,
      authority.contextGrantId,
      authority.projectionValidUntil,
      projection,
    ],
  );
  if (session.rowCount !== 1) throw new CommerceError("CONTEXT_EXPIRED");

  return operation();
}
