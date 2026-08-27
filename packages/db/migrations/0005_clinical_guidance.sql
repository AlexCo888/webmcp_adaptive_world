CREATE TABLE clinical_guidance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_user_id uuid NOT NULL REFERENCES users(id),
  relationship_id uuid NOT NULL REFERENCES doctor_patient_relationships(id),
  access_grant_id uuid NOT NULL REFERENCES access_grants(id),
  guidance text NOT NULL CHECK (length(guidance) BETWEEN 1 AND 2000),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX clinical_guidance_patient_time_idx
  ON clinical_guidance (patient_id, created_at);
CREATE INDEX clinical_guidance_doctor_time_idx
  ON clinical_guidance (doctor_user_id, created_at);

CREATE TRIGGER clinical_guidance_updated_at
  BEFORE UPDATE ON clinical_guidance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE clinical_guidance ENABLE ROW LEVEL SECURITY;

CREATE POLICY clinical_guidance_select ON clinical_guidance FOR SELECT USING (
  doctor_user_id = app_user_id()
  OR app_owns_patient(patient_id)
  OR app_is_admin()
);

CREATE POLICY clinical_guidance_insert ON clinical_guidance FOR INSERT WITH CHECK (
  (
    doctor_user_id = app_user_id()
    AND app_has_patient_scope(patient_id, 'passport.guidance.write')
  )
  OR app_is_admin()
);

CREATE POLICY clinical_guidance_update ON clinical_guidance FOR UPDATE
  USING (doctor_user_id = app_user_id() OR app_owns_patient(patient_id) OR app_is_admin())
  WITH CHECK (doctor_user_id = app_user_id() OR app_owns_patient(patient_id) OR app_is_admin());
