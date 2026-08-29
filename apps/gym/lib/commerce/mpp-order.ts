import {
  canonicalizeJson,
  createRoutineProCapability,
  digestRoutineProCapability,
  sha256Hex,
  verifySha256Hex,
} from "@adaptive-world/security";
import { MPP_PAYMENT_WINDOW_MS, ROUTINE_PRO } from "./constants";
import { getCommerceConfig, requireSecret } from "./config";
import { commercePool, withCommerceTransaction } from "./database";
import { CommerceError } from "./http";
import {
  parsePersistedTempoPaymentSnapshot,
  PersistedTempoPaymentSnapshotSchema,
  type PersistedTempoPaymentSnapshot,
} from "./mpp/snapshot";
import type { RoutineProOrder } from "./orders";

export const MPP_MERCHANT_SCOPE = "/api/commerce/routine-pro/mpp" as const;

export type PersistedMppOffer = PersistedTempoPaymentSnapshot;

export type PreparedMppOrder = {
  capability: string;
  capabilityExpiresAt: Date;
  offer: PersistedMppOffer;
  offerCanonical: string;
  offerFingerprint: string;
  setupId: string;
};

type ExistingRow = {
  setup_id: string;
  order_id: string;
  public_ref: string;
  provider: "mpp_tempo";
  amount_minor: number;
  currency: string;
  capability_version: number;
  capability_digest: string;
  capability_expires_at: Date;
  request_params: unknown;
  request_params_canonical: string;
  request_fingerprint: string;
  requested_expires_at: Date;
};

export type PreparedMppMerchantOrder = PreparedMppOrder & {
  capabilityDigest: string;
  gymSessionId: string;
  orderId: string;
  orderStatus: RoutineProOrder["status"];
  publicRef: string;
  providerChallengeId: string | null;
};

function parseMppOffer(value: unknown): PersistedMppOffer | null {
  const parsed = PersistedTempoPaymentSnapshotSchema.safeParse(value);
  return parsed.success ? parsePersistedTempoPaymentSnapshot(parsed.data) : null;
}

async function restorePrepared(row: ExistingRow): Promise<PreparedMppOrder> {
  const offer = parseMppOffer(row.request_params);
  if (!offer) throw new CommerceError("RECONCILIATION_REQUIRED");
  const canonical = canonicalizeJson(offer);
  if (
    canonical !== row.request_params_canonical ||
    !(await verifySha256Hex(canonical, row.request_fingerprint)) ||
    offer.orderId !== row.order_id ||
    offer.publicRef !== row.public_ref ||
    offer.provider !== row.provider ||
    offer.productKey !== ROUTINE_PRO.productKey ||
    offer.amountMinor !== row.amount_minor ||
    offer.currency !== row.currency ||
    offer.capabilityVersion !== row.capability_version ||
    offer.capabilityExpiresAt !== row.requested_expires_at.toISOString() ||
    offer.capabilityExpiresAt !== row.capability_expires_at.toISOString()
  ) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
  const authority = {
    publicRef: row.public_ref,
    productKey: offer.productKey,
    amountMinor: row.amount_minor,
    currency: row.currency,
    capabilityVersion: row.capability_version,
    capabilityExpiresAt: row.capability_expires_at,
  };
  const capability = await createRoutineProCapability(
    authority,
    requireSecret("COMMERCE_CAPABILITY_SECRET"),
  );
  if (!(await verifySha256Hex(capability, row.capability_digest))) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
  return {
    capability,
    capabilityExpiresAt: row.capability_expires_at,
    offer,
    offerCanonical: canonical,
    offerFingerprint: row.request_fingerprint,
    setupId: row.setup_id,
  };
}

export async function prepareMppOrder(order: RoutineProOrder): Promise<PreparedMppOrder> {
  if (order.provider !== "mpp_tempo") throw new CommerceError("ORDER_PENDING");
  const row = await withCommerceTransaction(async (client) => {
    const identity = await client.query<{ patient_id: string }>(
      "SELECT patient_id FROM commerce_orders WHERE id = $1",
      [order.id],
    );
    const patientId = identity.rows[0]?.patient_id;
    if (!patientId) throw new CommerceError("NOT_FOUND");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [patientId]);
    const locked = await client.query<{
      id: string;
      patient_id: string;
      public_ref: string;
      provider: string;
      status: string;
      amount_minor: number;
      currency: string;
      capability_version: number | null;
      capability_digest: string | null;
      capability_expires_at: Date | null;
    }>("SELECT * FROM commerce_orders WHERE id = $1 FOR UPDATE", [order.id]);
    const current = locked.rows[0];
    if (!current || current.provider !== "mpp_tempo") throw new CommerceError("ORDER_PENDING");
    if (
      !["provider_pending", "payment_submitted", "reconciliation_required"].includes(current.status)
    ) {
      throw new CommerceError("ORDER_EXPIRED");
    }
    const existing = await client.query<ExistingRow>(
      `SELECT pps.id AS setup_id, co.id AS order_id, co.public_ref, co.provider,
         co.amount_minor, co.currency, co.capability_version,
         co.capability_digest, co.capability_expires_at, pps.request_params,
         pps.request_params_canonical, pps.request_fingerprint,
         pps.requested_expires_at
       FROM payment_provider_setups pps
       JOIN commerce_orders co ON co.id = pps.order_id
       WHERE pps.order_id = $1 AND pps.provider = 'mpp_tempo'
       ORDER BY pps.version DESC LIMIT 1 FOR UPDATE OF pps`,
      [order.id],
    );
    if (existing.rows[0]) return existing.rows[0];

    const clock = await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");
    const now = clock.rows[0]?.now;
    if (!now) throw new CommerceError("INTERNAL_ERROR", true);
    const capabilityExpiresAt = new Date(now.getTime() + MPP_PAYMENT_WINDOW_MS);
    const capabilityVersion = 1;
    const authority = {
      publicRef: current.public_ref,
      productKey: ROUTINE_PRO.productKey,
      amountMinor: current.amount_minor,
      currency: current.currency,
      capabilityVersion,
      capabilityExpiresAt,
    };
    const capability = await createRoutineProCapability(
      authority,
      requireSecret("COMMERCE_CAPABILITY_SECRET"),
    );
    const capabilityDigest = await digestRoutineProCapability(capability);
    const commerceConfig = getCommerceConfig();
    if (!commerceConfig.agentEnabled) throw new CommerceError("PROVIDER_UNAVAILABLE");
    const merchantUrl = new URL(MPP_MERCHANT_SCOPE, `${commerceConfig.gymOrigin}/`).toString();
    const offer = parsePersistedTempoPaymentSnapshot({
      snapshotVersion: 1,
      orderId: current.id,
      publicRef: current.public_ref,
      provider: "mpp_tempo",
      productKey: ROUTINE_PRO.productKey,
      amountMinor: current.amount_minor,
      currency: current.currency,
      amountDecimal: "4.99",
      tempoAmountAtomic: "4990000",
      tempoCurrency: requireSecret("MPP_TEMPO_CURRENCY"),
      tempoRecipient: requireSecret("MPP_TEMPO_RECIPIENT"),
      tempoDecimals: 6,
      chainId: 42431,
      realm: new URL(merchantUrl).host,
      merchantUrl,
      scope: MPP_MERCHANT_SCOPE,
      capabilityVersion,
      capabilityExpiresAt: capabilityExpiresAt.toISOString(),
    });
    const canonical = canonicalizeJson(offer);
    const fingerprint = await sha256Hex(canonical);
    const setup = await client.query<{ id: string }>(
      `INSERT INTO payment_provider_setups (
         order_id, provider, version, status, idempotency_key, request_params,
         request_params_canonical, request_fingerprint, requested_expires_at,
         prepared_at, idempotency_replay_until
       ) VALUES ($1,'mpp_tempo',1,'prepared',$2,$3::jsonb,$3,$4,$5,$6,$5)
       RETURNING id`,
      [
        order.id,
        `routine_pro_${current.public_ref}_mpp_v1`,
        canonical,
        fingerprint,
        capabilityExpiresAt,
        now,
      ],
    );
    const setupId = setup.rows[0]?.id;
    if (!setupId) throw new CommerceError("INTERNAL_ERROR", true);
    const updated = await client.query(
      `UPDATE commerce_orders SET capability_version = $2, capability_digest = $3,
         capability_expires_at = $4, active_provider_setup_id = $5
       WHERE id = $1 AND capability_version IS NULL`,
      [order.id, capabilityVersion, capabilityDigest, capabilityExpiresAt, setupId],
    );
    if (updated.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
    return {
      setup_id: setupId,
      order_id: current.id,
      public_ref: current.public_ref,
      provider: "mpp_tempo",
      amount_minor: current.amount_minor,
      currency: current.currency,
      capability_version: capabilityVersion,
      capability_digest: capabilityDigest,
      capability_expires_at: capabilityExpiresAt,
      request_params: offer,
      request_params_canonical: canonical,
      request_fingerprint: fingerprint,
      requested_expires_at: capabilityExpiresAt,
    } satisfies ExistingRow;
  });
  return restorePrepared(row);
}

export async function getPreparedMppOrderByCapabilityDigest(
  capabilityDigest: string,
): Promise<PreparedMppMerchantOrder | null> {
  if (!/^[0-9a-f]{64}$/u.test(capabilityDigest)) return null;
  const result = await commercePool.query<
    ExistingRow & {
      gym_session_id: string | null;
      order_status: RoutineProOrder["status"];
      provider_challenge_id: string | null;
    }
  >(
    `SELECT pps.id AS setup_id, co.id AS order_id, co.public_ref, co.provider,
       co.amount_minor, co.currency, co.capability_version,
       co.capability_digest, co.capability_expires_at,
       co.originating_gym_session_id AS gym_session_id, co.status AS order_status,
       pps.provider_resource_id AS provider_challenge_id, pps.request_params,
       pps.request_params_canonical, pps.request_fingerprint,
       pps.requested_expires_at
     FROM payment_provider_setups pps
     JOIN commerce_orders co ON co.id = pps.order_id
     WHERE co.capability_digest = $1
       AND co.provider = 'mpp_tempo'
       AND co.active_provider_setup_id = pps.id
       AND pps.provider = 'mpp_tempo'
     LIMIT 1`,
    [capabilityDigest],
  );
  const row = result.rows[0];
  if (!row || !row.gym_session_id) return null;
  const prepared = await restorePrepared(row);
  return {
    ...prepared,
    capabilityDigest,
    gymSessionId: row.gym_session_id,
    orderId: row.order_id,
    orderStatus: row.order_status,
    publicRef: row.public_ref,
    providerChallengeId: row.provider_challenge_id,
  };
}

export async function attachMppChallenge(setupId: string, challengeId: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(challengeId)) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
  await withCommerceTransaction(async (client) => {
    const identity = await client.query<{ order_id: string; patient_id: string }>(
      `SELECT pps.order_id, co.patient_id
       FROM payment_provider_setups pps
       JOIN commerce_orders co ON co.id = pps.order_id
       WHERE pps.id = $1 AND pps.provider = 'mpp_tempo'`,
      [setupId],
    );
    const row = identity.rows[0];
    if (!row) throw new CommerceError("RECONCILIATION_REQUIRED");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [row.patient_id]);
    await client.query("SELECT id FROM commerce_orders WHERE id = $1 FOR UPDATE", [row.order_id]);
    const attached = await client.query(
      `UPDATE payment_provider_setups
       SET status = 'attached', provider_resource_id = COALESCE(provider_resource_id, $2),
           provider_created_at = COALESCE(provider_created_at, clock_timestamp()),
           provider_expires_at = requested_expires_at,
           attached_at = COALESCE(attached_at, clock_timestamp()),
           last_error_code = NULL
       WHERE id = $1 AND status IN ('prepared','requesting','attached')
         AND (provider_resource_id IS NULL OR provider_resource_id = $2)`,
      [setupId, challengeId],
    );
    if (attached.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
  });
}
