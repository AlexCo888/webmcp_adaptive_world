-- Defense in depth. Application authorization remains mandatory.
-- The API must SET LOCAL app.user_id / app.user_role after authenticating the
-- request. Gym sessions similarly SET LOCAL app.gym_subject_id from the signed,
-- HttpOnly session cookie. Use a non-owner runtime role because owners bypass RLS.

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_gym_subject_id() RETURNS uuid
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT nullif(current_setting('app.gym_subject_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = public.app_user_id() AND role = 'admin' AND disabled_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION app_owns_patient(target_patient_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = target_patient_id AND owner_user_id = public.app_user_id()
  )
$$;

CREATE OR REPLACE FUNCTION app_has_patient_scope(target_patient_id uuid, required_scope text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.app_is_admin()
    OR public.app_owns_patient(target_patient_id)
    OR EXISTS (
      SELECT 1
      FROM public.access_grants grant_row
      LEFT JOIN public.doctor_patient_relationships relationship
        ON relationship.id = grant_row.relationship_id
      WHERE grant_row.patient_id = target_patient_id
        AND grant_row.grantee_user_id = public.app_user_id()
        AND grant_row.status = 'active'
        AND grant_row.revoked_at IS NULL
        AND grant_row.expires_at > now()
        AND grant_row.scopes @> jsonb_build_array(required_scope)
        AND (
          grant_row.relationship_id IS NULL
          OR (
            relationship.status = 'active'
            AND relationship.revoked_at IS NULL
            AND (relationship.expires_at IS NULL OR relationship.expires_at > now())
          )
        )
    )
$$;

REVOKE ALL ON FUNCTION app_is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION app_owns_patient(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app_has_patient_scope(uuid, text) FROM PUBLIC;
-- Grant EXECUTE on the three helpers to the non-owner runtime role after it is
-- created by infrastructure. Do not grant table-owner privileges to that role.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_patient_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gym_session_equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users FOR SELECT USING (
  id = app_user_id()
  OR app_is_admin()
  OR EXISTS (
    SELECT 1 FROM patients p
    WHERE p.owner_user_id = users.id
      AND app_has_patient_scope(p.id, 'passport.summary.read')
  )
);
CREATE POLICY users_update_self ON users FOR UPDATE
  USING (id = app_user_id() OR app_is_admin())
  WITH CHECK (id = app_user_id() OR app_is_admin());

CREATE POLICY patients_select ON patients FOR SELECT USING (
  app_has_patient_scope(id, 'passport.summary.read')
);
CREATE POLICY patients_insert ON patients FOR INSERT WITH CHECK (
  owner_user_id = app_user_id() OR app_is_admin()
);
CREATE POLICY patients_update ON patients FOR UPDATE
  USING (app_owns_patient(id) OR app_is_admin())
  WITH CHECK (owner_user_id = app_user_id() OR app_is_admin());

CREATE POLICY doctor_profiles_select ON doctor_profiles FOR SELECT USING (
  user_id = app_user_id() OR app_is_admin()
  OR EXISTS (
    SELECT 1 FROM doctor_patient_relationships relationship
    WHERE relationship.doctor_user_id = doctor_profiles.user_id
      AND app_owns_patient(relationship.patient_id)
  )
);
CREATE POLICY doctor_profiles_write ON doctor_profiles FOR ALL
  USING (user_id = app_user_id() OR app_is_admin())
  WITH CHECK (user_id = app_user_id() OR app_is_admin());

CREATE POLICY relationships_select ON doctor_patient_relationships FOR SELECT USING (
  doctor_user_id = app_user_id() OR app_owns_patient(patient_id) OR app_is_admin()
);
CREATE POLICY relationships_insert ON doctor_patient_relationships FOR INSERT WITH CHECK (
  (app_owns_patient(patient_id) AND invited_by_user_id = app_user_id()) OR app_is_admin()
);
CREATE POLICY relationships_update ON doctor_patient_relationships FOR UPDATE
  USING (doctor_user_id = app_user_id() OR app_owns_patient(patient_id) OR app_is_admin())
  WITH CHECK (doctor_user_id = app_user_id() OR app_owns_patient(patient_id) OR app_is_admin());

CREATE POLICY access_grants_select ON access_grants FOR SELECT USING (
  grantee_user_id = app_user_id() OR app_owns_patient(patient_id) OR app_is_admin()
);
CREATE POLICY access_grants_insert ON access_grants FOR INSERT WITH CHECK (
  (app_owns_patient(patient_id) AND created_by_user_id = app_user_id()) OR app_is_admin()
);
CREATE POLICY access_grants_update ON access_grants FOR UPDATE
  USING (app_owns_patient(patient_id) OR app_is_admin())
  WITH CHECK (app_owns_patient(patient_id) OR app_is_admin());

CREATE POLICY documents_select ON documents FOR SELECT USING (
  app_has_patient_scope(patient_id, 'passport.documents.read')
);
CREATE POLICY documents_insert ON documents FOR INSERT WITH CHECK (
  (app_owns_patient(patient_id) AND uploaded_by_user_id = app_user_id()) OR app_is_admin()
);
CREATE POLICY documents_update ON documents FOR UPDATE
  USING (app_owns_patient(patient_id) OR app_is_admin())
  WITH CHECK (app_owns_patient(patient_id) OR app_is_admin());

CREATE POLICY lab_reports_select ON lab_reports FOR SELECT USING (
  app_has_patient_scope(patient_id, 'passport.clinical.read')
);
CREATE POLICY lab_reports_write ON lab_reports FOR ALL
  USING (app_owns_patient(patient_id) OR app_is_admin())
  WITH CHECK (app_owns_patient(patient_id) OR app_is_admin());

CREATE POLICY lab_results_select ON lab_results FOR SELECT USING (
  app_has_patient_scope(patient_id, 'passport.clinical.read')
);
CREATE POLICY lab_results_write ON lab_results FOR ALL
  USING (app_owns_patient(patient_id) OR app_is_admin())
  WITH CHECK (app_owns_patient(patient_id) OR app_is_admin());

-- Context grant rows contain the disclosed projection, so only the patient
-- owner or an administrator can read/manage them directly. Gym redemption must
-- use the narrowly scoped function below, never a broad SELECT policy.
CREATE POLICY context_grants_select ON context_grants FOR SELECT USING (
  app_owns_patient(patient_id) OR app_is_admin()
);
CREATE POLICY context_grants_insert ON context_grants FOR INSERT WITH CHECK (
  (app_owns_patient(patient_id) AND created_by_user_id = app_user_id()) OR app_is_admin()
);
CREATE POLICY context_grants_update ON context_grants FOR UPDATE
  USING (created_by_user_id = app_user_id() OR app_is_admin())
  WITH CHECK (created_by_user_id = app_user_id() OR app_is_admin());

CREATE POLICY equipment_public_read ON equipment FOR SELECT USING (true);
CREATE POLICY equipment_admin_write ON equipment FOR ALL
  USING (app_is_admin()) WITH CHECK (app_is_admin());

CREATE POLICY gym_sessions_select ON gym_sessions FOR SELECT USING (
  anonymous_subject_id = app_gym_subject_id()
  OR (patient_id IS NOT NULL AND app_owns_patient(patient_id))
  OR app_is_admin()
);
CREATE POLICY gym_sessions_insert ON gym_sessions FOR INSERT WITH CHECK (
  anonymous_subject_id = app_gym_subject_id() OR app_is_admin()
);
CREATE POLICY gym_sessions_update ON gym_sessions FOR UPDATE
  USING (anonymous_subject_id = app_gym_subject_id() OR app_is_admin())
  WITH CHECK (anonymous_subject_id = app_gym_subject_id() OR app_is_admin());

CREATE POLICY gym_session_equipment_select ON gym_session_equipment FOR SELECT USING (
  EXISTS (SELECT 1 FROM gym_sessions s WHERE s.id = session_id)
);
CREATE POLICY gym_session_equipment_write ON gym_session_equipment FOR ALL
  USING (EXISTS (SELECT 1 FROM gym_sessions s WHERE s.id = session_id))
  WITH CHECK (EXISTS (SELECT 1 FROM gym_sessions s WHERE s.id = session_id));

CREATE POLICY session_feedback_select ON session_feedback FOR SELECT USING (
  anonymous_subject_id = app_gym_subject_id()
  OR EXISTS (
    SELECT 1 FROM gym_sessions s
    WHERE s.id = session_id AND s.patient_id IS NOT NULL AND app_owns_patient(s.patient_id)
  )
  OR app_is_admin()
);
CREATE POLICY session_feedback_insert ON session_feedback FOR INSERT WITH CHECK (
  anonymous_subject_id = app_gym_subject_id() OR app_is_admin()
);

CREATE POLICY audit_events_select ON audit_events FOR SELECT USING (
  actor_user_id = app_user_id()
  OR (patient_id IS NOT NULL AND app_owns_patient(patient_id))
  OR app_is_admin()
);
CREATE POLICY audit_events_insert ON audit_events FOR INSERT WITH CHECK (
  actor_user_id = app_user_id() OR (actor_user_id IS NULL AND app_gym_subject_id() IS NOT NULL)
);

-- This is the only operation the Gym exchange endpoint needs. It is atomic and
-- cannot list, replay, or revoke grants. Configure EXECUTE for the runtime role
-- explicitly after provisioning that role; PUBLIC receives no access.
CREATE OR REPLACE FUNCTION redeem_context_grant(
  p_token_hash varchar,
  p_expected_audience varchar,
  p_session_id uuid
)
RETURNS TABLE (
  grant_id uuid,
  patient_id uuid,
  audience varchar,
  purpose text,
  scopes jsonb,
  projection jsonb,
  expires_at timestamptz
)
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  UPDATE public.context_grants
  SET redeemed_at = now(), redeemed_by_session_id = p_session_id
  WHERE token_hash = p_token_hash
    AND context_grants.audience = p_expected_audience
    AND redeemed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  RETURNING id, context_grants.patient_id, context_grants.audience,
    context_grants.purpose, context_grants.scopes, context_grants.projection,
    context_grants.expires_at
$$;
REVOKE ALL ON FUNCTION redeem_context_grant(varchar, varchar, uuid) FROM PUBLIC;

-- Database-level recursive backstop. The security package additionally applies
-- a strict allowlist and validates types before insertion.
CREATE OR REPLACE FUNCTION jsonb_has_sensitive_gym_key(value jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE entry record;
DECLARE normalized_key text;
BEGIN
  IF jsonb_typeof(value) = 'object' THEN
    FOR entry IN SELECT * FROM jsonb_each(value) LOOP
      normalized_key := regexp_replace(lower(entry.key), '[^a-z0-9]', '', 'g');
      IF normalized_key ~ '(fullname|firstname|lastname|email|phone|address|birth|dob|identity|patientid|userid|medication|prescriptiondrug|labresult|laboratory|diagnosis|document|doctor|emergencycontact|allergy)' THEN
        RETURN true;
      END IF;
      IF jsonb_has_sensitive_gym_key(entry.value) THEN RETURN true; END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'array' THEN
    FOR entry IN SELECT element AS value FROM jsonb_array_elements(value) element LOOP
      IF jsonb_has_sensitive_gym_key(entry.value) THEN RETURN true; END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION validate_gym_projection() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.audience !~* 'gym' THEN RETURN NEW; END IF;
  IF jsonb_has_sensitive_gym_key(NEW.projection) THEN
    RAISE EXCEPTION 'gym context projection contains a sensitive field';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER context_grants_validate_projection
  BEFORE INSERT OR UPDATE OF projection ON context_grants
  FOR EACH ROW EXECUTE FUNCTION validate_gym_projection();
