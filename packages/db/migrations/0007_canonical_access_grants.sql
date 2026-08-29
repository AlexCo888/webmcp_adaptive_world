-- Collapse legacy duplicate active rows without reducing the scopes or lifetime
-- that were already effective through their union. New writes use one canonical
-- row per patient/clinician and replace that row atomically.
-- Drizzle executes the migration batch in one transaction. Hold this lock for
-- that transaction so an older application instance cannot insert a new live
-- duplicate between the collapse and the unique-index build.
LOCK TABLE access_grants IN SHARE ROW EXCLUSIVE MODE;

-- Retire stale legacy rows before selecting the authority that survives the
-- cutover. The partial unique index intentionally cannot put expires_at in its
-- predicate (now() is not immutable), so leaving these rows as active would
-- make them conflict with the canonical upsert even though they no longer
-- convey authority. Marking them expired also prevents their scopes from being
-- folded into a grant that is live at this transaction's now() snapshot.
UPDATE access_grants AS expired_grant
SET
  status = 'expired',
  updated_at = now()
WHERE expired_grant.status = 'active'
  AND expired_grant.revoked_at IS NULL
  AND expired_grant.expires_at <= now();

WITH ranked AS (
  SELECT
    grant_row.*,
    first_value(grant_row.id) OVER (
      PARTITION BY grant_row.patient_id, grant_row.grantee_user_id
      ORDER BY grant_row.created_at DESC, grant_row.id DESC
    ) AS canonical_id,
    count(*) OVER (
      PARTITION BY grant_row.patient_id, grant_row.grantee_user_id
    ) AS authority_count
  FROM access_grants AS grant_row
  WHERE grant_row.status = 'active'
    AND grant_row.revoked_at IS NULL
    AND grant_row.expires_at > now()
), merged AS (
  SELECT
    ranked.patient_id,
    ranked.grantee_user_id,
    ranked.canonical_id,
    max(ranked.expires_at) AS expires_at,
    coalesce(
      jsonb_agg(DISTINCT scope_value ORDER BY scope_value)
        FILTER (WHERE scope_value IS NOT NULL),
      '[]'::jsonb
    ) AS scopes
  FROM ranked
  LEFT JOIN LATERAL jsonb_array_elements_text(ranked.scopes) AS scope(scope_value) ON true
  WHERE ranked.authority_count > 1
  GROUP BY ranked.patient_id, ranked.grantee_user_id, ranked.canonical_id
)
UPDATE access_grants AS canonical
SET
  scopes = merged.scopes,
  expires_at = merged.expires_at,
  updated_at = now()
FROM merged
WHERE canonical.id = merged.canonical_id;

WITH ranked AS (
  SELECT
    grant_row.id,
    row_number() OVER (
      PARTITION BY grant_row.patient_id, grant_row.grantee_user_id
      ORDER BY grant_row.created_at DESC, grant_row.id DESC
    ) AS authority_rank
  FROM access_grants AS grant_row
  WHERE grant_row.status = 'active'
    AND grant_row.revoked_at IS NULL
    AND grant_row.expires_at > now()
)
UPDATE access_grants AS duplicate
SET
  status = 'revoked',
  revoked_at = now(),
  revoked_by_user_id = duplicate.created_by_user_id,
  updated_at = now()
FROM ranked
WHERE duplicate.id = ranked.id
  AND ranked.authority_rank > 1;

CREATE UNIQUE INDEX access_grants_one_live_authority_uidx
  ON access_grants (patient_id, grantee_user_id)
  WHERE status = 'active' AND revoked_at IS NULL;
