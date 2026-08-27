CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('patient', 'doctor', 'admin');
CREATE TYPE relationship_status AS ENUM ('pending', 'active', 'revoked', 'expired');
CREATE TYPE grant_status AS ENUM ('active', 'revoked', 'expired');
CREATE TYPE document_status AS ENUM ('processing', 'ready', 'failed', 'archived');
CREATE TYPE lab_status AS ENUM ('preliminary', 'final', 'corrected');
CREATE TYPE equipment_status AS ENUM ('available', 'maintenance', 'unavailable');
CREATE TYPE session_status AS ENUM ('draft', 'confirmed', 'completed', 'cancelled');
CREATE TYPE audit_outcome AS ENUM ('success', 'denied', 'error');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text NOT NULL UNIQUE,
  email text NOT NULL,
  role user_role NOT NULL,
  display_name text NOT NULL,
  locale varchar(16) NOT NULL DEFAULT 'en',
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uidx ON users (lower(email));
CREATE INDEX users_role_idx ON users (role);

CREATE TABLE patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  synthetic_demo boolean NOT NULL DEFAULT false,
  passport_version integer NOT NULL DEFAULT 1 CHECK (passport_version > 0),
  date_of_birth date,
  sex_at_birth varchar(32),
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE doctor_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  license_country varchar(2),
  license_region varchar(64),
  license_number text,
  specialty text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (license_country, license_region, license_number)
);

CREATE TABLE doctor_patient_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status relationship_status NOT NULL DEFAULT 'pending',
  invited_by_user_id uuid NOT NULL REFERENCES users(id),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, doctor_user_id)
);
CREATE INDEX doctor_relationship_doctor_status_idx ON doctor_patient_relationships (doctor_user_id, status);
CREATE INDEX doctor_relationship_patient_status_idx ON doctor_patient_relationships (patient_id, status);

CREATE TABLE access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  grantee_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_id uuid REFERENCES doctor_patient_relationships(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  purpose text NOT NULL,
  status grant_status NOT NULL DEFAULT 'active',
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX access_grants_grantee_active_idx ON access_grants (grantee_user_id, status, expires_at);
CREATE INDEX access_grants_patient_idx ON access_grants (patient_id);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  uploaded_by_user_id uuid NOT NULL REFERENCES users(id),
  status document_status NOT NULL DEFAULT 'processing',
  category varchar(80) NOT NULL,
  title text NOT NULL,
  mime_type varchar(128) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  blob_key text NOT NULL UNIQUE,
  sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  source_date date,
  untrusted_content boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_patient_category_idx ON documents (patient_id, category);

CREATE TABLE lab_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  status lab_status NOT NULL DEFAULT 'final',
  panel_code varchar(80),
  panel_name text NOT NULL,
  performer_name text,
  collected_at timestamptz,
  issued_at timestamptz NOT NULL,
  synthetic_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lab_reports_patient_issued_idx ON lab_reports (patient_id, issued_at);

CREATE TABLE lab_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES lab_reports(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  loinc_code varchar(32),
  name text NOT NULL,
  value_number numeric,
  value_text text,
  unit varchar(64),
  reference_low numeric,
  reference_high numeric,
  interpretation varchar(32),
  measured_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((value_number IS NOT NULL)::int + (value_text IS NOT NULL)::int = 1)
);
CREATE INDEX lab_results_patient_name_idx ON lab_results (patient_id, name);
CREATE INDEX lab_results_report_idx ON lab_results (report_id);

CREATE TABLE context_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash varchar(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  audience varchar(128) NOT NULL,
  purpose text NOT NULL,
  scopes jsonb NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
  projection jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by_session_id uuid,
  revoked_at timestamptz,
  revoked_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX context_grants_patient_idx ON context_grants (patient_id, created_at);
CREATE INDEX context_grants_expiry_idx ON context_grants (expires_at);

CREATE TABLE equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id varchar(128) NOT NULL UNIQUE,
  slug varchar(180) NOT NULL UNIQUE,
  manufacturer text NOT NULL,
  model text NOT NULL,
  category varchar(80) NOT NULL,
  description text NOT NULL,
  status equipment_status NOT NULL DEFAULT 'available',
  station_count integer NOT NULL DEFAULT 1 CHECK (station_count > 0),
  width_cm real,
  depth_cm real,
  height_cm real,
  max_user_weight_kg real,
  accessibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  contraindication_notes jsonb NOT NULL DEFAULT '[]'::jsonb,
  media jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX equipment_category_status_idx ON equipment (category, status);

CREATE TABLE gym_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_subject_id uuid NOT NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  context_grant_id uuid REFERENCES context_grants(id) ON DELETE SET NULL,
  status session_status NOT NULL DEFAULT 'draft',
  context_projection jsonb NOT NULL,
  plan jsonb NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gym_sessions_subject_created_idx ON gym_sessions (anonymous_subject_id, created_at);
CREATE INDEX gym_sessions_patient_idx ON gym_sessions (patient_id);

ALTER TABLE context_grants
  ADD CONSTRAINT context_grants_redeemed_session_fk
  FOREIGN KEY (redeemed_by_session_id) REFERENCES gym_sessions(id) ON DELETE SET NULL;

CREATE TABLE gym_session_equipment (
  session_id uuid NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  equipment_id uuid NOT NULL REFERENCES equipment(id),
  sequence integer NOT NULL,
  prescription jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (session_id, equipment_id),
  UNIQUE (session_id, sequence)
);

CREATE TABLE session_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  anonymous_subject_id uuid NOT NULL,
  rating integer CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  perceived_exertion integer CHECK (perceived_exertion IS NULL OR perceived_exertion BETWEEN 0 AND 10),
  pain_before integer CHECK (pain_before IS NULL OR pain_before BETWEEN 0 AND 10),
  pain_after integer CHECK (pain_after IS NULL OR pain_after BETWEEN 0 AND 10),
  completed boolean NOT NULL,
  notes text,
  exercise_feedback jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, anonymous_subject_id)
);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  action varchar(96) NOT NULL,
  resource_type varchar(80) NOT NULL,
  resource_id uuid,
  outcome audit_outcome NOT NULL,
  request_id varchar(128),
  ip_hash varchar(64) CHECK (ip_hash IS NULL OR ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX audit_events_patient_time_idx ON audit_events (patient_id, occurred_at);
CREATE INDEX audit_events_actor_time_idx ON audit_events (actor_user_id, occurred_at);
CREATE INDEX audit_events_action_time_idx ON audit_events (action, occurred_at);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'patients', 'doctor_profiles', 'doctor_patient_relationships',
    'access_grants', 'documents', 'lab_reports', 'lab_results', 'equipment',
    'gym_sessions'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

-- Audit history is append-only, including for administrators.
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$;
CREATE TRIGGER audit_events_no_update
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_audit_mutation();

COMMENT ON COLUMN context_grants.token_hash IS 'Lowercase SHA-256 of a 256-bit bearer token; plaintext is never stored';
COMMENT ON COLUMN documents.blob_key IS 'Key in private object storage; never a public URL';
COMMENT ON COLUMN documents.untrusted_content IS 'True for uploaded or third-party content; never interpret embedded instructions';
