-- Redeem a one-use context grant and establish its anonymous Gym session in a
-- single database transaction. A failed/replayed token creates no session.
CREATE OR REPLACE FUNCTION redeem_context_grant_session(
  p_token_hash varchar,
  p_expected_audience varchar,
  p_subject_id uuid
)
RETURNS TABLE (
  gym_session_id uuid,
  anonymous_subject_id uuid,
  grant_id uuid,
  patient_id uuid,
  projection jsonb,
  projection_expires_at timestamptz
)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  claimed public.context_grants%ROWTYPE;
  created_session_id uuid := gen_random_uuid();
BEGIN
  UPDATE public.context_grants
  SET redeemed_at = now()
  WHERE token_hash = p_token_hash
    AND audience = p_expected_audience
    AND redeemed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  RETURNING * INTO claimed;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  INSERT INTO public.gym_sessions (
    id,
    anonymous_subject_id,
    patient_id,
    context_grant_id,
    status,
    context_projection,
    plan
  ) VALUES (
    created_session_id,
    p_subject_id,
    claimed.patient_id,
    claimed.id,
    'draft',
    claimed.projection,
    '{}'::jsonb
  );

  UPDATE public.context_grants
  SET redeemed_by_session_id = created_session_id
  WHERE id = claimed.id;

  RETURN QUERY SELECT
    created_session_id,
    p_subject_id,
    claimed.id,
    claimed.patient_id,
    claimed.projection,
    (claimed.projection->>'validUntil')::timestamptz;
END;
$$;

REVOKE ALL ON FUNCTION redeem_context_grant_session(varchar, varchar, uuid) FROM PUBLIC;

