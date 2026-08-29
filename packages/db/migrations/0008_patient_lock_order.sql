-- Context redemption previously locked a context grant before inserting a Gym
-- session whose patient FK acquires a patient key-share lock. Demo reset and
-- commerce transactions lock the patient first, so that order could deadlock.
-- Resolve the patient without a row lock, take the shared patient serialization
-- lock, and only then claim the one-use grant.
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
  target_patient_id uuid;
  created_session_id uuid := gen_random_uuid();
BEGIN
  SELECT grant_row.patient_id
  INTO target_patient_id
  FROM public.context_grants AS grant_row
  WHERE grant_row.token_hash = p_token_hash
    AND grant_row.audience = p_expected_audience
    AND grant_row.redeemed_at IS NULL
    AND grant_row.revoked_at IS NULL
    AND grant_row.expires_at > now()
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.patients AS patient_row
  WHERE patient_row.id = target_patient_id
  FOR UPDATE OF patient_row;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.context_grants
  SET redeemed_at = now()
  WHERE token_hash = p_token_hash
    AND audience = p_expected_audience
    AND patient_id = target_patient_id
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
