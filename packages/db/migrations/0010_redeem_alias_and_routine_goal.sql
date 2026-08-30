-- Fix the production redemption function without rewriting an already-applied
-- migration. PL/pgSQL output columns are variables, so every context_grants
-- reference in the claim must be qualified to avoid a patient_id collision.
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

  UPDATE public.context_grants AS grant_row
  SET redeemed_at = now()
  WHERE grant_row.token_hash = p_token_hash
    AND grant_row.audience = p_expected_audience
    AND grant_row.patient_id = target_patient_id
    AND grant_row.redeemed_at IS NULL
    AND grant_row.revoked_at IS NULL
    AND grant_row.expires_at > now()
  RETURNING grant_row.* INTO claimed;

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

  UPDATE public.context_grants AS grant_row
  SET redeemed_by_session_id = created_session_id
  WHERE grant_row.id = claimed.id;

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

-- Preserve the person's bounded natural-language goal across a provider
-- redirect or an agent-payment retry. Legacy pending orders may remain NULL;
-- every newly created order supplies a validated goal.
ALTER TABLE commerce_orders ADD COLUMN initial_goal text;
ALTER TABLE commerce_orders
  ADD CONSTRAINT commerce_orders_initial_goal_check
  CHECK (
    initial_goal IS NULL
    OR (initial_goal = btrim(initial_goal) AND length(initial_goal) BETWEEN 2 AND 160)
  );

CREATE OR REPLACE FUNCTION reject_commerce_order_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.patient_id <> OLD.patient_id
    OR NEW.product_key <> OLD.product_key
    OR NEW.payer_kind <> OLD.payer_kind
    OR NEW.initiated_via <> OLD.initiated_via
    OR NEW.initial_template_id <> OLD.initial_template_id
    OR NEW.initial_goal IS DISTINCT FROM OLD.initial_goal
    OR NEW.amount_minor <> OLD.amount_minor
    OR NEW.currency <> OLD.currency
  THEN
    RAISE EXCEPTION 'commerce order authority fields are immutable';
  END IF;
  IF OLD.provider IS NOT NULL AND NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'a committed payment provider cannot be changed';
  END IF;
  IF OLD.capability_expires_at IS NOT NULL
    AND NEW.capability_expires_at IS DISTINCT FROM OLD.capability_expires_at
  THEN
    RAISE EXCEPTION 'MPP capability expiry is immutable';
  END IF;
  IF OLD.capability_version IS NOT NULL
    AND NEW.capability_version IS DISTINCT FROM OLD.capability_version
  THEN
    RAISE EXCEPTION 'MPP capability version is immutable';
  END IF;
  IF OLD.capability_digest IS NOT NULL
    AND NEW.capability_digest IS DISTINCT FROM OLD.capability_digest
  THEN
    RAISE EXCEPTION 'MPP capability digest is immutable';
  END IF;
  RETURN NEW;
END;
$$;
