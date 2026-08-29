CREATE TYPE commerce_payer_kind AS ENUM ('human', 'agent');
CREATE TYPE commerce_provider AS ENUM ('stripe_checkout', 'mpp_tempo');
CREATE TYPE commerce_order_status AS ENUM (
  'created',
  'provider_pending',
  'payment_submitted',
  'reconciliation_required',
  'paid_unfulfilled',
  'fulfilled',
  'failed',
  'expired',
  'voided',
  'duplicate_paid',
  'refund_pending',
  'refunded'
);
CREATE TYPE provider_setup_status AS ENUM (
  'prepared',
  'requesting',
  'attached',
  'reconciliation_required',
  'failed_terminal'
);
CREATE TYPE entitlement_grant_status AS ENUM ('active', 'revoked');
CREATE TYPE agent_budget_reservation_status AS ENUM (
  'reserved',
  'submitted',
  'reconciliation_required',
  'settled',
  'released'
);

CREATE TABLE commerce_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_ref varchar(64) NOT NULL UNIQUE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  originating_gym_session_id uuid REFERENCES gym_sessions(id) ON DELETE SET NULL,
  product_key varchar(128) NOT NULL,
  payer_kind commerce_payer_kind NOT NULL,
  provider commerce_provider,
  initiated_via varchar(24) NOT NULL CHECK (initiated_via IN ('site-ui', 'webmcp')),
  initial_template_id varchar(96) NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency varchar(12) NOT NULL CHECK (currency = lower(currency)),
  status commerce_order_status NOT NULL DEFAULT 'created',
  provider_payment_ref text,
  receipt_digest varchar(64) CHECK (
    receipt_digest IS NULL OR receipt_digest ~ '^[0-9a-f]{64}$'
  ),
  active_provider_setup_id uuid,
  capability_version integer CHECK (capability_version IS NULL OR capability_version > 0),
  capability_digest varchar(64) CHECK (
    capability_digest IS NULL OR capability_digest ~ '^[0-9a-f]{64}$'
  ),
  capability_expires_at timestamptz,
  budget_reservation_id uuid,
  submitted_at timestamptz,
  paid_at timestamptz,
  fulfilled_at timestamptz,
  reconciled_at timestamptz,
  voided_at timestamptz,
  failure_code varchar(96),
  duplicate_of_order_id uuid REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  refund_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_orders_id_amount_unique UNIQUE (id, amount_minor),
  CHECK (
    (capability_version IS NULL)::int
    + (capability_digest IS NULL)::int
    + (capability_expires_at IS NULL)::int IN (0, 3)
  ),
  CHECK (
    capability_digest IS NULL
    OR (provider IS NOT NULL AND provider = 'mpp_tempo')
  )
);

CREATE UNIQUE INDEX commerce_orders_provider_payment_uidx
  ON commerce_orders (provider, provider_payment_ref)
  WHERE provider_payment_ref IS NOT NULL;
CREATE UNIQUE INDEX commerce_orders_one_payable_entitlement_idx
  ON commerce_orders (patient_id, product_key)
  WHERE status IN (
    'created',
    'provider_pending',
    'payment_submitted',
    'reconciliation_required',
    'paid_unfulfilled'
  );
CREATE INDEX commerce_orders_patient_created_idx
  ON commerce_orders (patient_id, created_at);

CREATE TABLE payment_provider_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  provider commerce_provider NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status provider_setup_status NOT NULL DEFAULT 'prepared',
  idempotency_key varchar(255) NOT NULL UNIQUE,
  request_params jsonb NOT NULL,
  request_params_canonical text NOT NULL,
  request_fingerprint varchar(64) NOT NULL CHECK (
    request_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  CHECK (request_params = request_params_canonical::jsonb),
  CHECK (
    request_fingerprint = encode(
      digest(request_params_canonical, 'sha256'),
      'hex'
    )
  ),
  requested_expires_at timestamptz NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  first_request_started_at timestamptz,
  idempotency_replay_until timestamptz NOT NULL,
  request_started_at timestamptz,
  lease_owner_hash varchar(64) CHECK (
    lease_owner_hash IS NULL OR lease_owner_hash ~ '^[0-9a-f]{64}$'
  ),
  lease_expires_at timestamptz,
  provider_resource_id text,
  provider_created_at timestamptz,
  provider_expires_at timestamptz,
  attached_at timestamptz,
  last_error_code varchar(96),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, provider, version),
  CHECK (idempotency_replay_until > prepared_at),
  CHECK (
    (status = 'attached' AND provider_resource_id IS NOT NULL AND attached_at IS NOT NULL)
    OR status <> 'attached'
  )
);

CREATE UNIQUE INDEX payment_provider_setups_resource_uidx
  ON payment_provider_setups (provider_resource_id)
  WHERE provider_resource_id IS NOT NULL;
CREATE UNIQUE INDEX payment_provider_setups_one_nonterminal_idx
  ON payment_provider_setups (order_id)
  WHERE status IN ('prepared', 'requesting', 'attached', 'reconciliation_required');

ALTER TABLE commerce_orders
  ADD CONSTRAINT commerce_orders_active_provider_setup_fk
  FOREIGN KEY (active_provider_setup_id)
  REFERENCES payment_provider_setups(id)
  ON DELETE RESTRICT;

CREATE TABLE entitlement_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  entitlement_key varchar(128) NOT NULL,
  source_order_id uuid NOT NULL UNIQUE REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  status entitlement_grant_status NOT NULL DEFAULT 'active',
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE UNIQUE INDEX entitlement_grants_active_patient_key_uidx
  ON entitlement_grants (patient_id, entitlement_key)
  WHERE status = 'active';

CREATE TABLE saved_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  source_gym_session_id uuid NOT NULL REFERENCES gym_sessions(id) ON DELETE RESTRICT,
  entitlement_grant_id uuid NOT NULL REFERENCES entitlement_grants(id) ON DELETE RESTRICT,
  title text NOT NULL,
  plan jsonb NOT NULL,
  plan_hash varchar(64) NOT NULL CHECK (plan_hash ~ '^[0-9a-f]{64}$'),
  template_id varchar(96) NOT NULL,
  template_version varchar(24) NOT NULL,
  catalog_version varchar(64) NOT NULL,
  created_via varchar(24) NOT NULL CHECK (created_via IN ('site-ui', 'webmcp')),
  saved_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_id, source_gym_session_id, template_id)
);
CREATE INDEX saved_routines_patient_saved_idx
  ON saved_routines (patient_id, saved_at);

CREATE TABLE agent_budget_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_subject varchar(128) NOT NULL,
  budget_date date NOT NULL,
  currency varchar(12) NOT NULL CHECK (currency = lower(currency)),
  limit_minor integer NOT NULL CHECK (limit_minor >= 0),
  reserved_minor integer NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  settled_minor integer NOT NULL DEFAULT 0 CHECK (settled_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_subject, budget_date, currency),
  CHECK (reserved_minor + settled_minor <= limit_minor)
);

CREATE TABLE agent_budget_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id uuid NOT NULL REFERENCES agent_budget_buckets(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL UNIQUE REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  status agent_budget_reservation_status NOT NULL DEFAULT 'reserved',
  submitted_at timestamptz,
  settled_at timestamptz,
  released_at timestamptz,
  release_reason varchar(128),
  last_reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_budget_reservations_order_amount_fk
    FOREIGN KEY (order_id, amount_minor)
    REFERENCES commerce_orders(id, amount_minor)
    ON DELETE RESTRICT
);
CREATE INDEX agent_budget_reservations_bucket_status_idx
  ON agent_budget_reservations (bucket_id, status);

ALTER TABLE commerce_orders
  ADD CONSTRAINT commerce_orders_budget_reservation_fk
  FOREIGN KEY (budget_reservation_id)
  REFERENCES agent_budget_reservations(id)
  ON DELETE RESTRICT;

CREATE TABLE payment_provider_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider commerce_provider NOT NULL,
  provider_event_id varchar(255) NOT NULL,
  order_id uuid NOT NULL REFERENCES commerce_orders(id) ON DELETE RESTRICT,
  event_type varchar(128) NOT NULL,
  payload_digest varchar(64) NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  outcome varchar(96),
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX payment_provider_events_order_received_idx
  ON payment_provider_events (order_id, received_at);

-- Shared replay/atomic state for mppx. This table is deliberately separate
-- from product orders so provider replay evidence survives demo resets.
CREATE TABLE mpp_replay_store (
  key varchar(512) PRIMARY KEY,
  value jsonb NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mpp_replay_store_expiry_idx ON mpp_replay_store (expires_at);

-- Stores only keyed hashes. Raw Gym sessions, order references, IP addresses,
-- and agent subjects never enter the limiter table.
CREATE TABLE commerce_rate_limits (
  key_hash varchar(64) PRIMARY KEY CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  dimension varchar(16) NOT NULL CHECK (dimension IN ('session', 'order', 'ip', 'agent')),
  hit_count integer NOT NULL DEFAULT 1 CHECK (hit_count > 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > window_started_at)
);
CREATE INDEX commerce_rate_limits_expiry_idx ON commerce_rate_limits (expires_at);

CREATE OR REPLACE FUNCTION reject_provider_setup_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.idempotency_key <> OLD.idempotency_key
    OR NEW.request_params IS DISTINCT FROM OLD.request_params
    OR NEW.request_params_canonical <> OLD.request_params_canonical
    OR NEW.request_fingerprint <> OLD.request_fingerprint
    OR NEW.requested_expires_at <> OLD.requested_expires_at
    OR NEW.prepared_at <> OLD.prepared_at
    OR NEW.idempotency_replay_until <> OLD.idempotency_replay_until
  THEN
    RAISE EXCEPTION 'payment provider request snapshots are immutable';
  END IF;
  IF OLD.first_request_started_at IS NOT NULL
    AND NEW.first_request_started_at IS DISTINCT FROM OLD.first_request_started_at
  THEN
    RAISE EXCEPTION 'the first provider request timestamp is immutable';
  END IF;
  IF OLD.provider_resource_id IS NOT NULL
    AND NEW.provider_resource_id IS DISTINCT FROM OLD.provider_resource_id
  THEN
    RAISE EXCEPTION 'an attached provider resource cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_provider_setups_immutable_snapshot
  BEFORE UPDATE ON payment_provider_setups
  FOR EACH ROW EXECUTE FUNCTION reject_provider_setup_snapshot_mutation();

CREATE OR REPLACE FUNCTION reject_commerce_order_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.patient_id <> OLD.patient_id
    OR NEW.product_key <> OLD.product_key
    OR NEW.payer_kind <> OLD.payer_kind
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

CREATE TRIGGER commerce_orders_immutable_authority
  BEFORE UPDATE ON commerce_orders
  FOR EACH ROW EXECUTE FUNCTION reject_commerce_order_authority_mutation();

CREATE OR REPLACE FUNCTION reject_agent_budget_reservation_authority_mutation()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bucket_id IS DISTINCT FROM OLD.bucket_id
    OR NEW.order_id IS DISTINCT FROM OLD.order_id
    OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
  THEN
    RAISE EXCEPTION 'agent budget reservation authority fields are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER agent_budget_reservations_immutable_authority
  BEFORE UPDATE ON agent_budget_reservations
  FOR EACH ROW EXECUTE FUNCTION reject_agent_budget_reservation_authority_mutation();

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'commerce_orders',
    'payment_provider_setups',
    'entitlement_grants',
    'saved_routines',
    'agent_budget_buckets',
    'agent_budget_reservations',
    'mpp_replay_store',
    'commerce_rate_limits'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name,
      table_name
    );
  END LOOP;
END;
$$;

COMMENT ON COLUMN payment_provider_setups.request_params_canonical IS
  'Canonical byte-stable Stripe request representation. Retries must parse and reuse this snapshot rather than rebuild parameters.';
COMMENT ON COLUMN payment_provider_setups.idempotency_replay_until IS
  'Conservative cutoff before Stripe may prune an idempotency key. Unattached retries at or after this instant fail closed into reconciliation.';
COMMENT ON COLUMN commerce_orders.capability_expires_at IS
  'Immutable MPP capability expiry bound into the deterministic HMAC so crash recovery can regenerate the identical capability.';
