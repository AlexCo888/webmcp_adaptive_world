import { canonicalizeJson, sha256Hex, verifySha256Hex } from "@adaptive-world/security";
import Stripe from "stripe";
import { getCommerceConfig, requireSecret, requireStripeTestSecretKey } from "./config";
import { ROUTINE_PRO, STRIPE_IDEMPOTENCY_REPLAY_WINDOW_MS } from "./constants";
import { commercePool, withCommerceTransaction } from "./database";
import { CommerceError } from "./http";
import type { RoutineProOrder } from "./orders";
import {
  isStripeCheckoutAlreadyTerminalized,
  resolveStripeDuplicateRefund,
  resolveStripeSessionAttachAction,
  resolveStripeSetupClaimAction,
  retrieveOrCreateStripeRefund,
} from "./stripe-policy";

export type StripeCheckoutSnapshot = {
  mode: "payment";
  line_items: [{ price: string; quantity: 1 }];
  success_url: string;
  cancel_url: string;
  client_reference_id: string;
  metadata: {
    publicRef: string;
    productKey: "adaptive_world.routine_pro.v1";
    sandbox: "true";
  };
  expires_at: number;
  integration_identifier: string;
};

type SetupStatus =
  "prepared" | "requesting" | "attached" | "reconciliation_required" | "failed_terminal";

export type StripeSetup = {
  id: string;
  orderId: string;
  version: number;
  status: SetupStatus;
  idempotencyKey: string;
  requestParams: StripeCheckoutSnapshot;
  requestParamsCanonical: string;
  requestFingerprint: string;
  requestedExpiresAt: Date;
  preparedAt: Date;
  firstRequestStartedAt: Date | null;
  idempotencyReplayUntil: Date;
  leaseOwnerHash: string | null;
  leaseExpiresAt: Date | null;
  providerResourceId: string | null;
  providerCreatedAt: Date | null;
  providerExpiresAt: Date | null;
  attachedAt: Date | null;
};

type SetupRow = {
  id: string;
  order_id: string;
  version: number;
  status: SetupStatus;
  idempotency_key: string;
  request_params: unknown;
  request_params_canonical: string;
  request_fingerprint: string;
  requested_expires_at: Date;
  prepared_at: Date;
  first_request_started_at: Date | null;
  idempotency_replay_until: Date;
  lease_owner_hash: string | null;
  lease_expires_at: Date | null;
  provider_resource_id: string | null;
  provider_created_at: Date | null;
  provider_expires_at: Date | null;
  attached_at: Date | null;
};

export interface StripeGateway {
  createCheckout(
    params: StripeCheckoutSnapshot,
    idempotencyKey: string,
  ): Promise<Stripe.Checkout.Session>;
  retrieveCheckout(id: string): Promise<Stripe.Checkout.Session>;
  expireCheckout(id: string): Promise<Stripe.Checkout.Session>;
  listLineItems(id: string): Promise<Stripe.ApiList<Stripe.LineItem>>;
  createRefund(paymentIntent: string, idempotencyKey: string): Promise<Stripe.Refund>;
  retrieveRefund(id: string): Promise<Stripe.Refund>;
}

let stripeGateway: StripeGateway | undefined;

export function getStripeGateway(): StripeGateway {
  if (stripeGateway) return stripeGateway;
  const stripe = new Stripe(requireStripeTestSecretKey(), {
    maxNetworkRetries: 2,
    timeout: 20_000,
    appInfo: { name: "Adaptive World", version: "0.1.0" },
  });
  stripeGateway = {
    createCheckout: (params, idempotencyKey) =>
      stripe.checkout.sessions.create(params, { idempotencyKey }),
    retrieveCheckout: (id) => stripe.checkout.sessions.retrieve(id),
    expireCheckout: (id) => stripe.checkout.sessions.expire(id),
    listLineItems: (id) => stripe.checkout.sessions.listLineItems(id, { limit: 10 }),
    createRefund: (paymentIntent, idempotencyKey) =>
      stripe.refunds.create({ payment_intent: paymentIntent }, { idempotencyKey }),
    retrieveRefund: (id) => stripe.refunds.retrieve(id),
  };
  return stripeGateway;
}

function randomLetters(length: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

function snapshotFor(order: RoutineProOrder, preparedAt: Date): StripeCheckoutSnapshot {
  const config = getCommerceConfig();
  const expiresAt = Math.floor(preparedAt.getTime() / 1_000) + config.checkoutWindowMinutes * 60;
  return {
    mode: "payment",
    line_items: [{ price: requireSecret("STRIPE_ROUTINE_PRO_PRICE_ID"), quantity: 1 }],
    success_url: `${config.gymOrigin}/session?routinePro=success&order=${order.publicRef}`,
    cancel_url: `${config.gymOrigin}/session?routinePro=cancelled&order=${order.publicRef}`,
    client_reference_id: order.publicRef,
    metadata: {
      publicRef: order.publicRef,
      productKey: ROUTINE_PRO.productKey,
      sandbox: "true",
    },
    expires_at: expiresAt,
    integration_identifier: `adaptive_world_${randomLetters(8)}`,
  };
}

function isStripeSnapshot(value: unknown): value is StripeCheckoutSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const lines = item.line_items;
  const metadata = item.metadata;
  return (
    item.mode === "payment" &&
    Array.isArray(lines) &&
    lines.length === 1 &&
    typeof lines[0] === "object" &&
    lines[0] !== null &&
    (lines[0] as Record<string, unknown>).quantity === 1 &&
    typeof (lines[0] as Record<string, unknown>).price === "string" &&
    typeof item.success_url === "string" &&
    typeof item.cancel_url === "string" &&
    typeof item.client_reference_id === "string" &&
    typeof item.expires_at === "number" &&
    typeof item.integration_identifier === "string" &&
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as Record<string, unknown>).productKey === ROUTINE_PRO.productKey &&
    (metadata as Record<string, unknown>).sandbox === "true"
  );
}

async function mapAndVerifySetup(row: SetupRow): Promise<StripeSetup> {
  if (!isStripeSnapshot(row.request_params)) throw new CommerceError("RECONCILIATION_REQUIRED");
  const canonical = canonicalizeJson(row.request_params);
  if (
    canonical !== row.request_params_canonical ||
    !(await verifySha256Hex(canonical, row.request_fingerprint)) ||
    new Date(row.request_params.expires_at * 1_000).getTime() !== row.requested_expires_at.getTime()
  ) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
  return {
    id: row.id,
    orderId: row.order_id,
    version: row.version,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    requestParams: row.request_params,
    requestParamsCanonical: row.request_params_canonical,
    requestFingerprint: row.request_fingerprint,
    requestedExpiresAt: row.requested_expires_at,
    preparedAt: row.prepared_at,
    firstRequestStartedAt: row.first_request_started_at,
    idempotencyReplayUntil: row.idempotency_replay_until,
    leaseOwnerHash: row.lease_owner_hash,
    leaseExpiresAt: row.lease_expires_at,
    providerResourceId: row.provider_resource_id,
    providerCreatedAt: row.provider_created_at,
    providerExpiresAt: row.provider_expires_at,
    attachedAt: row.attached_at,
  };
}

export async function prepareStripeCheckoutSetup(order: RoutineProOrder): Promise<StripeSetup> {
  if (!getCommerceConfig().stripeEnabled) throw new CommerceError("PROVIDER_UNAVAILABLE");
  const result = await withCommerceTransaction(async (client) => {
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [order.patientId]);
    const lockedOrder = await client.query<{
      id: string;
      provider: string | null;
      status: string;
      public_ref: string;
    }>("SELECT id, provider, status, public_ref FROM commerce_orders WHERE id = $1 FOR UPDATE", [
      order.id,
    ]);
    const current = lockedOrder.rows[0];
    if (!current || current.provider !== "stripe_checkout") {
      throw new CommerceError("ORDER_PENDING");
    }
    if (
      ![
        "created",
        "provider_pending",
        "payment_submitted",
        "reconciliation_required",
        "paid_unfulfilled",
      ].includes(current.status)
    ) {
      throw new CommerceError("ORDER_EXPIRED");
    }

    const existing = await client.query<SetupRow>(
      `SELECT * FROM payment_provider_setups
       WHERE order_id = $1
         AND status IN ('prepared','requesting','attached','reconciliation_required')
       ORDER BY version DESC LIMIT 1 FOR UPDATE`,
      [order.id],
    );
    if (existing.rows[0]) return existing.rows[0];

    const clock = await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");
    const preparedAt = clock.rows[0]?.now;
    if (!preparedAt) throw new CommerceError("INTERNAL_ERROR", true);
    const snapshot = snapshotFor(order, preparedAt);
    const canonical = canonicalizeJson(snapshot);
    const fingerprint = await sha256Hex(canonical);
    const replayUntil = new Date(preparedAt.getTime() + STRIPE_IDEMPOTENCY_REPLAY_WINDOW_MS);
    const idempotencyKey = `routine_pro_${order.publicRef}_stripe_v1`;
    const inserted = await client.query<SetupRow>(
      `INSERT INTO payment_provider_setups (
         order_id, provider, version, status, idempotency_key, request_params,
         request_params_canonical, request_fingerprint, requested_expires_at,
         prepared_at, idempotency_replay_until
       ) VALUES ($1,'stripe_checkout',1,'prepared',$2,$3::jsonb,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        order.id,
        idempotencyKey,
        canonical,
        canonical,
        fingerprint,
        new Date(snapshot.expires_at * 1_000),
        preparedAt,
        replayUntil,
      ],
    );
    const setup = inserted.rows[0];
    if (!setup) throw new CommerceError("INTERNAL_ERROR", true);
    await client.query(
      `UPDATE commerce_orders
       SET active_provider_setup_id = $2, status = 'provider_pending'
       WHERE id = $1 AND active_provider_setup_id IS NULL`,
      [order.id, setup.id],
    );
    return setup;
  });
  return mapAndVerifySetup(result);
}

type Claim =
  | { kind: "claimed"; setup: StripeSetup; leaseOwnerHash: string }
  | { kind: "attached"; setup: StripeSetup }
  | { kind: "pending" }
  | { kind: "reconciliation" };

async function claimStripeSetup(setupId: string, nowOverride?: Date): Promise<Claim> {
  const leaseToken = crypto.randomUUID();
  const leaseOwnerHash = await sha256Hex(leaseToken);
  const row = await withCommerceTransaction(async (client) => {
    const identity = await client.query<{ order_id: string; patient_id: string }>(
      `SELECT pps.order_id, co.patient_id FROM payment_provider_setups pps
       JOIN commerce_orders co ON co.id = pps.order_id WHERE pps.id = $1`,
      [setupId],
    );
    const currentIdentity = identity.rows[0];
    if (!currentIdentity) throw new CommerceError("RECONCILIATION_REQUIRED");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [
      currentIdentity.patient_id,
    ]);
    const lockedOrder = await client.query<{
      active_provider_setup_id: string | null;
      provider: string | null;
      status: string;
    }>(
      `SELECT active_provider_setup_id, provider, status
       FROM commerce_orders WHERE id = $1 FOR UPDATE`,
      [currentIdentity.order_id],
    );
    const result = await client.query<SetupRow>(
      "SELECT * FROM payment_provider_setups WHERE id = $1 FOR UPDATE",
      [setupId],
    );
    const setup = result.rows[0];
    if (!setup) throw new CommerceError("RECONCILIATION_REQUIRED");
    const order = lockedOrder.rows[0];
    const claimAction = resolveStripeSetupClaimAction({
      activeProviderSetupId: order?.active_provider_setup_id ?? null,
      orderProvider: order?.provider ?? null,
      orderStatus: order?.status ?? "missing",
      setupId: setup.id,
      setupStatus: setup.status,
    });
    if (claimAction === "expired") throw new CommerceError("ORDER_EXPIRED");
    if (claimAction === "reconciliation") {
      return { kind: "reconciliation" as const };
    }
    if (setup.status === "attached" && setup.provider_resource_id) {
      return { kind: "attached" as const, row: setup };
    }
    const clock = nowOverride
      ? { rows: [{ now: nowOverride }] }
      : await client.query<{ now: Date }>("SELECT clock_timestamp() AS now");
    const now = clock.rows[0]?.now;
    if (!now) throw new CommerceError("INTERNAL_ERROR", true);

    // Codex P1 safeguard: once Stripe may have pruned the key, an unattached
    // retry must make zero create calls and cannot rotate setup, rail, or key.
    if (now.getTime() >= setup.idempotency_replay_until.getTime()) {
      await client.query(
        `UPDATE payment_provider_setups
         SET status = 'reconciliation_required', lease_owner_hash = NULL,
             lease_expires_at = NULL, last_error_code = 'IDEMPOTENCY_REPLAY_WINDOW_ENDED'
         WHERE id = $1 AND status IN ('prepared','requesting')
           AND provider_resource_id IS NULL`,
        [setup.id],
      );
      const reconciledOrder = await client.query(
        `UPDATE commerce_orders
         SET status = 'reconciliation_required',
             failure_code = 'IDEMPOTENCY_REPLAY_WINDOW_ENDED'
         WHERE id = $1 AND provider = 'stripe_checkout'
           AND status = 'provider_pending' AND active_provider_setup_id = $2`,
        [setup.order_id, setup.id],
      );
      if (reconciledOrder.rowCount !== 1) throw new CommerceError("ORDER_EXPIRED");
      return { kind: "reconciliation" as const };
    }
    if (setup.lease_expires_at && setup.lease_expires_at.getTime() > now.getTime()) {
      return { kind: "pending" as const };
    }
    const claimed = await client.query<SetupRow>(
      `UPDATE payment_provider_setups
       SET status = 'requesting', first_request_started_at = COALESCE(first_request_started_at, $2),
           request_started_at = $2, lease_owner_hash = $3, lease_expires_at = $4
       WHERE id = $1 AND status IN ('prepared','requesting')
         AND provider_resource_id IS NULL RETURNING *`,
      [setup.id, now, leaseOwnerHash, new Date(now.getTime() + 30_000)],
    );
    const claimedRow = claimed.rows[0];
    if (!claimedRow) throw new CommerceError("RECONCILIATION_REQUIRED");
    return { kind: "claimed" as const, row: claimedRow, leaseOwnerHash };
  });
  if (row.kind === "reconciliation" || row.kind === "pending") return row;
  const verified = await mapAndVerifySetup(row.row);
  return row.kind === "attached"
    ? { kind: "attached", setup: verified }
    : { kind: "claimed", setup: verified, leaseOwnerHash: row.leaseOwnerHash };
}

export async function createStripeSessionOnlyWhenReplaySafe({
  setup,
  now = new Date(),
  create,
}: {
  setup: StripeSetup;
  now?: Date;
  create: () => Promise<Stripe.Checkout.Session>;
}): Promise<Stripe.Checkout.Session> {
  if (!setup.providerResourceId && now.getTime() >= setup.idempotencyReplayUntil.getTime()) {
    throw new CommerceError("PROVIDER_SETUP_RECONCILIATION_REQUIRED");
  }
  return create();
}

function verifyCheckoutSessionCommonAuthority(
  session: Stripe.Checkout.Session,
  setup: StripeSetup,
): void {
  const expected = setup.requestParams;
  const durationSeconds = session.expires_at - session.created;
  if (
    session.mode !== "payment" ||
    session.livemode !== false ||
    session.client_reference_id !== expected.client_reference_id ||
    session.metadata?.publicRef !== expected.metadata.publicRef ||
    session.metadata?.productKey !== expected.metadata.productKey ||
    session.metadata?.sandbox !== "true" ||
    session.integration_identifier !== expected.integration_identifier ||
    session.expires_at !== expected.expires_at ||
    durationSeconds < 30 * 60 ||
    durationSeconds > 24 * 60 * 60 ||
    session.amount_total !== ROUTINE_PRO.amountMinor ||
    session.currency !== ROUTINE_PRO.currency
  ) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
}

function verifyCheckoutSession(
  session: Stripe.Checkout.Session,
  setup: StripeSetup,
): asserts session is Stripe.Checkout.Session & { url: string } {
  verifyCheckoutSessionCommonAuthority(session, setup);
  let checkoutUrl: URL | null = null;
  try {
    checkoutUrl = session.url ? new URL(session.url) : null;
  } catch {
    checkoutUrl = null;
  }
  if (
    session.status !== "open" ||
    session.payment_status !== "unpaid" ||
    !session.url ||
    !checkoutUrl ||
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.hostname !== "checkout.stripe.com" ||
    checkoutUrl.username !== "" ||
    checkoutUrl.password !== ""
  ) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
}

export function isDefinitivelyExpiredStripeCheckout(session: Stripe.Checkout.Session): boolean {
  return session.status === "expired" && session.payment_status === "unpaid";
}

async function verifyCheckoutAuthorityWithReconciliation({
  session,
  setup,
}: {
  session: Stripe.Checkout.Session;
  setup: StripeSetup;
}): Promise<void> {
  try {
    verifyCheckoutSessionCommonAuthority(session, setup);
  } catch (error) {
    if (!(error instanceof CommerceError)) throw error;
    await markSetupAmbiguous(setup.id, "STRIPE_SESSION_RESPONSE_MISMATCH");
    throw new CommerceError("PROVIDER_SETUP_RECONCILIATION_REQUIRED");
  }
}

export async function closeDefinitivelyExpiredStripeCheckout({
  failureCode,
  orderTerminalStatus,
  providerOutcome = "expired",
  session,
  setup,
}: {
  failureCode: string;
  orderTerminalStatus: "expired" | "voided";
  providerOutcome?: "expired" | "async_payment_failed";
  session: Stripe.Checkout.Session;
  setup: StripeSetup;
}): Promise<void> {
  await verifyCheckoutAuthorityWithReconciliation({ session, setup });
  const definitivelyUnpaid =
    providerOutcome === "expired"
      ? isDefinitivelyExpiredStripeCheckout(session)
      : session.status === "complete" && session.payment_status === "unpaid";
  if (!definitivelyUnpaid) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
  const closed = await withCommerceTransaction(async (client) => {
    const identity = await client.query<{ patient_id: string }>(
      "SELECT patient_id FROM commerce_orders WHERE id = $1",
      [setup.orderId],
    );
    const patientId = identity.rows[0]?.patient_id;
    if (!patientId) return false;
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [patientId]);
    const order = await client.query<{
      active_provider_setup_id: string | null;
      provider: string | null;
      status: string;
    }>(
      `SELECT active_provider_setup_id, provider, status
       FROM commerce_orders WHERE id = $1 FOR UPDATE`,
      [setup.orderId],
    );
    const currentOrder = order.rows[0];
    const currentSetup = await client.query<{
      provider_resource_id: string | null;
      status: SetupStatus;
    }>(
      `SELECT provider_resource_id, status FROM payment_provider_setups
       WHERE id = $1 FOR UPDATE`,
      [setup.id],
    );
    const providerSetup = currentSetup.rows[0];
    if (
      currentOrder &&
      providerSetup &&
      isStripeCheckoutAlreadyTerminalized({
        orderStatus: currentOrder.status,
        providerResourceId: providerSetup.provider_resource_id,
        sessionId: session.id,
        setupStatus: providerSetup.status,
      })
    ) {
      return true;
    }
    if (
      currentOrder?.provider !== "stripe_checkout" ||
      currentOrder.status !== "provider_pending" ||
      currentOrder.active_provider_setup_id !== setup.id ||
      providerSetup?.status !== "attached" ||
      providerSetup.provider_resource_id !== session.id
    ) {
      return false;
    }
    const terminalSetup = await client.query(
      `UPDATE payment_provider_setups SET status = 'failed_terminal',
         lease_owner_hash = NULL, lease_expires_at = NULL, last_error_code = $2
       WHERE id = $1 AND status = 'attached' AND provider_resource_id = $3`,
      [setup.id, failureCode.slice(0, 96), session.id],
    );
    if (terminalSetup.rowCount !== 1) return false;
    const terminalOrder = await client.query(
      `UPDATE commerce_orders SET status = $2::commerce_order_status,
         voided_at = CASE WHEN $2 = 'voided' THEN now() ELSE voided_at END,
         failure_code = $3
       WHERE id = $1 AND provider = 'stripe_checkout'
         AND status = 'provider_pending' AND active_provider_setup_id = $4`,
      [setup.orderId, orderTerminalStatus, failureCode.slice(0, 96), setup.id],
    );
    return terminalOrder.rowCount === 1;
  });
  if (!closed) throw new CommerceError("RECONCILIATION_REQUIRED");
}

export async function verifyStripeCheckoutSessionWithReconciliation({
  session,
  setup,
  markReconciliation = (code) => markSetupAmbiguous(setup.id, code),
}: {
  session: Stripe.Checkout.Session;
  setup: StripeSetup;
  markReconciliation?: (code: string) => Promise<void>;
}): Promise<Stripe.Checkout.Session & { url: string }> {
  try {
    verifyCheckoutSession(session, setup);
    return session;
  } catch (error) {
    if (!(error instanceof CommerceError)) throw error;
    await markReconciliation("STRIPE_SESSION_RESPONSE_MISMATCH");
    throw new CommerceError("PROVIDER_SETUP_RECONCILIATION_REQUIRED");
  }
}

async function markSetupAmbiguous(
  setupId: string,
  code: string,
  expectedLeaseOwnerHash?: string,
): Promise<void> {
  await withCommerceTransaction(async (client) => {
    const setupIdentity = await client.query<{ order_id: string; patient_id: string }>(
      `SELECT pps.order_id, co.patient_id FROM payment_provider_setups pps
       JOIN commerce_orders co ON co.id = pps.order_id WHERE pps.id = $1`,
      [setupId],
    );
    const identity = setupIdentity.rows[0];
    if (!identity) return;
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [identity.patient_id]);
    await client.query("SELECT id FROM commerce_orders WHERE id = $1 FOR UPDATE", [
      identity.order_id,
    ]);
    await client.query("SELECT id FROM payment_provider_setups WHERE id = $1 FOR UPDATE", [
      setupId,
    ]);
    const marked = await client.query(
      `UPDATE payment_provider_setups
       SET status = 'reconciliation_required', lease_owner_hash = NULL,
           lease_expires_at = NULL, last_error_code = $2
       WHERE id = $1
         AND (
           ($3::text IS NULL AND status IN (
             'prepared','requesting','attached','reconciliation_required'
           ))
           OR ($3::text IS NOT NULL AND status = 'requesting'
             AND lease_owner_hash = $3 AND provider_resource_id IS NULL)
         )`,
      [setupId, code, expectedLeaseOwnerHash ?? null],
    );
    if (marked.rowCount !== 1) return;
    await client.query(
      `UPDATE commerce_orders SET status = 'reconciliation_required', failure_code = $2
       WHERE id = $1 AND status IN (
         'created','provider_pending','payment_submitted','reconciliation_required'
       )`,
      [identity.order_id, code],
    );
  });
}

async function releaseStripeSetupForExactKeyRetry(
  setupId: string,
  leaseOwnerHash: string,
  code: string,
): Promise<void> {
  await withCommerceTransaction(async (client) => {
    const identity = await client.query<{ order_id: string; patient_id: string }>(
      `SELECT pps.order_id, co.patient_id FROM payment_provider_setups pps
       JOIN commerce_orders co ON co.id = pps.order_id WHERE pps.id = $1`,
      [setupId],
    );
    const row = identity.rows[0];
    if (!row) return;
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [row.patient_id]);
    const order = await client.query<{ active_provider_setup_id: string | null; status: string }>(
      `SELECT active_provider_setup_id, status FROM commerce_orders
       WHERE id = $1 FOR UPDATE`,
      [row.order_id],
    );
    await client.query("SELECT id FROM payment_provider_setups WHERE id = $1 FOR UPDATE", [
      setupId,
    ]);
    if (
      order.rows[0]?.status !== "provider_pending" ||
      order.rows[0].active_provider_setup_id !== setupId
    ) {
      return;
    }
    await client.query(
      `UPDATE payment_provider_setups
       SET lease_owner_hash = NULL, lease_expires_at = NULL, last_error_code = $3
       WHERE id = $1 AND status = 'requesting' AND lease_owner_hash = $2
         AND provider_resource_id IS NULL`,
      [setupId, leaseOwnerHash, code],
    );
  });
}

async function attachStripeSession(
  setup: StripeSetup,
  session: Stripe.Checkout.Session & { url: string },
  leaseOwnerHash: string,
): Promise<"attached" | "already_attached" | "pending" | "terminal" | "reconciliation"> {
  const attached = await withCommerceTransaction(async (client) => {
    const identity = await client.query<{ patient_id: string }>(
      "SELECT patient_id FROM commerce_orders WHERE id = $1",
      [setup.orderId],
    );
    if (!identity.rows[0]) throw new CommerceError("RECONCILIATION_REQUIRED");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [
      identity.rows[0].patient_id,
    ]);
    const order = await client.query<{
      active_provider_setup_id: string | null;
      provider: string | null;
      status: string;
    }>(
      `SELECT active_provider_setup_id, provider, status
       FROM commerce_orders WHERE id = $1 FOR UPDATE`,
      [setup.orderId],
    );
    const current = await client.query<SetupRow>(
      "SELECT * FROM payment_provider_setups WHERE id = $1 FOR UPDATE",
      [setup.id],
    );
    const row = current.rows[0];
    if (!row) throw new CommerceError("RECONCILIATION_REQUIRED");
    const lockedOrder = order.rows[0];
    const action = resolveStripeSessionAttachAction({
      activeProviderSetupId: lockedOrder?.active_provider_setup_id ?? null,
      claimantLeaseOwnerHash: leaseOwnerHash,
      orderProvider: lockedOrder?.provider ?? null,
      orderStatus: lockedOrder?.status ?? "missing",
      providerResourceId: row.provider_resource_id,
      sessionId: session.id,
      setupId: setup.id,
      setupLeaseOwnerHash: row.lease_owner_hash,
      setupStatus: row.status,
    });
    if (action !== "attach" && action !== "reconciliation") return action;
    if (action === "reconciliation") {
      await client.query(
        `UPDATE payment_provider_setups
         SET status = 'reconciliation_required', last_error_code = 'PROVIDER_RESOURCE_MISMATCH'
         WHERE id = $1 AND status IN ('prepared','requesting','attached')`,
        [setup.id],
      );
      await client.query(
        `UPDATE commerce_orders SET status = 'reconciliation_required',
           failure_code = 'PROVIDER_RESOURCE_MISMATCH'
         WHERE id = $1 AND status = 'provider_pending'
           AND active_provider_setup_id = $2`,
        [setup.orderId, setup.id],
      );
      return "reconciliation" as const;
    }
    const updated = await client.query(
      `UPDATE payment_provider_setups
       SET status = 'attached', provider_resource_id = $2, provider_created_at = $3,
           provider_expires_at = $4, attached_at = COALESCE(attached_at, now()),
           lease_owner_hash = NULL, lease_expires_at = NULL, last_error_code = NULL
       WHERE id = $1 AND status = 'requesting' AND provider_resource_id IS NULL
         AND lease_owner_hash = $5`,
      [
        setup.id,
        session.id,
        new Date(session.created * 1_000),
        new Date(session.expires_at * 1_000),
        leaseOwnerHash,
      ],
    );
    return updated.rowCount === 1 ? ("attached" as const) : ("reconciliation" as const);
  });
  return attached;
}

export async function createOrResumeStripeCheckout(
  order: RoutineProOrder,
  gateway: StripeGateway = getStripeGateway(),
): Promise<{ checkoutUrl: string; expiresAt: string; resumed: boolean }> {
  const prepared = await prepareStripeCheckoutSetup(order);
  const claim = await claimStripeSetup(prepared.id);
  if (claim.kind === "pending") throw new CommerceError("PROVIDER_SETUP_PENDING", true);
  if (claim.kind === "reconciliation") {
    throw new CommerceError("PROVIDER_SETUP_RECONCILIATION_REQUIRED");
  }
  if (claim.kind === "attached") {
    let existing: Stripe.Checkout.Session;
    try {
      existing = await gateway.retrieveCheckout(claim.setup.providerResourceId!);
    } catch {
      throw new CommerceError("PROVIDER_SETUP_PENDING", true);
    }
    if (isDefinitivelyExpiredStripeCheckout(existing)) {
      await closeDefinitivelyExpiredStripeCheckout({
        failureCode: "STRIPE_SESSION_EXPIRED_UNPAID",
        orderTerminalStatus: "expired",
        session: existing,
        setup: claim.setup,
      });
      throw new CommerceError("ORDER_EXPIRED");
    }
    if (
      existing.status === "complete" &&
      (existing.payment_status === "paid" || existing.payment_status === "unpaid")
    ) {
      // Checkout has definitively closed, but the signed webhook remains the
      // payment authority. Preserve the attached setup until it arrives.
      throw new CommerceError("PROVIDER_SETUP_PENDING", true);
    }
    const verified = await verifyStripeCheckoutSessionWithReconciliation({
      session: existing,
      setup: claim.setup,
    });
    let lines: Stripe.ApiList<Stripe.LineItem>;
    try {
      lines = await gateway.listLineItems(verified.id);
    } catch {
      throw new CommerceError("PROVIDER_SETUP_PENDING", true);
    }
    if (
      lines.data.length !== 1 ||
      lines.data[0]?.price?.id !== claim.setup.requestParams.line_items[0].price ||
      lines.data[0]?.price?.livemode !== false ||
      lines.data[0]?.quantity !== 1
    ) {
      await markSetupAmbiguous(claim.setup.id, "LINE_ITEM_MISMATCH");
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    return {
      checkoutUrl: verified.url,
      expiresAt: new Date(verified.expires_at * 1_000).toISOString(),
      resumed: true,
    };
  }

  try {
    const session = await createStripeSessionOnlyWhenReplaySafe({
      setup: claim.setup,
      create: () => gateway.createCheckout(claim.setup.requestParams, claim.setup.idempotencyKey),
    });
    const verified = await verifyStripeCheckoutSessionWithReconciliation({
      session,
      setup: claim.setup,
      markReconciliation: (code) => markSetupAmbiguous(claim.setup.id, code, claim.leaseOwnerHash),
    });
    const attachOutcome = await attachStripeSession(claim.setup, verified, claim.leaseOwnerHash);
    if (attachOutcome === "pending") {
      throw new CommerceError("PROVIDER_SETUP_PENDING", true);
    }
    if (attachOutcome === "reconciliation") {
      throw new CommerceError("PROVIDER_SETUP_RECONCILIATION_REQUIRED", true);
    }
    if (attachOutcome === "terminal") {
      try {
        const expired = await gateway.expireCheckout(verified.id);
        if (!isDefinitivelyExpiredStripeCheckout(expired)) {
          throw new CommerceError("RECONCILIATION_REQUIRED");
        }
      } catch {
        throw new CommerceError("PROVIDER_SETUP_RECONCILIATION_REQUIRED", true);
      }
      throw new CommerceError("ORDER_EXPIRED");
    }
    const lines = await gateway.listLineItems(verified.id);
    const expectedPrice = claim.setup.requestParams.line_items[0].price;
    if (
      lines.data.length !== 1 ||
      lines.data[0]?.price?.id !== expectedPrice ||
      lines.data[0]?.price?.livemode !== false ||
      lines.data[0]?.quantity !== 1
    ) {
      await markSetupAmbiguous(claim.setup.id, "LINE_ITEM_MISMATCH");
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    return {
      checkoutUrl: verified.url,
      expiresAt: new Date(verified.expires_at * 1_000).toISOString(),
      resumed: attachOutcome === "already_attached",
    };
  } catch (error) {
    if (error instanceof CommerceError) throw error;
    await releaseStripeSetupForExactKeyRetry(
      claim.setup.id,
      claim.leaseOwnerHash,
      "STRIPE_EXACT_KEY_RETRY",
    );
    throw new CommerceError("PROVIDER_SETUP_PENDING", true);
  }
}

export async function loadStripeSetupForOrder(orderId: string): Promise<StripeSetup | null> {
  const result = await commercePool.query<SetupRow>(
    `SELECT * FROM payment_provider_setups
     WHERE order_id = $1 AND provider = 'stripe_checkout'
     ORDER BY version DESC LIMIT 1`,
    [orderId],
  );
  return result.rows[0] ? mapAndVerifySetup(result.rows[0]) : null;
}

export function constructStripeWebhookEvent(rawBody: string | Buffer, signature: string) {
  const stripe = new Stripe(requireStripeTestSecretKey());
  return stripe.webhooks.constructEvent(rawBody, signature, requireSecret("STRIPE_WEBHOOK_SECRET"));
}

export async function reconcileDuplicateStripeRefund({
  order,
  refund,
}: {
  order: RoutineProOrder;
  refund: Stripe.Refund;
}): Promise<"refunded" | "pending" | "reconciliation_required"> {
  const resolution = resolveStripeDuplicateRefund({ order, refund });
  if (!resolution.persistReference) {
    await commercePool.query(
      `UPDATE commerce_orders SET failure_code = $2
       WHERE id = $1 AND status IN ('duplicate_paid','refund_pending')`,
      [order.id, resolution.failureCode],
    );
    return resolution.outcome;
  }

  const updated =
    resolution.outcome === "refunded"
      ? await commercePool.query<{ status: RoutineProOrder["status"] }>(
          `UPDATE commerce_orders
           SET status = 'refunded', refund_reference = COALESCE(refund_reference, $2),
               reconciled_at = COALESCE(reconciled_at, now()), failure_code = NULL
           WHERE id = $1 AND provider = 'stripe_checkout'
             AND provider_payment_ref = $3 AND amount_minor = $4 AND currency = $5
             AND status IN ('duplicate_paid','refund_pending','refunded')
             AND (refund_reference IS NULL OR refund_reference = $2)
           RETURNING status`,
          [order.id, refund.id, order.providerPaymentRef, order.amountMinor, order.currency],
        )
      : await commercePool.query<{ status: RoutineProOrder["status"] }>(
          `UPDATE commerce_orders
           SET status = 'refund_pending', refund_reference = COALESCE(refund_reference, $2),
               failure_code = $3
           WHERE id = $1 AND provider = 'stripe_checkout'
             AND provider_payment_ref = $4 AND amount_minor = $5 AND currency = $6
             AND status IN ('duplicate_paid','refund_pending')
             AND (refund_reference IS NULL OR refund_reference = $2)
           RETURNING status`,
          [
            order.id,
            refund.id,
            resolution.failureCode,
            order.providerPaymentRef,
            order.amountMinor,
            order.currency,
          ],
        );
  if (updated.rowCount === 1) return resolution.outcome;

  // A concurrent refund.updated handler may have advanced the same refund to
  // succeeded after this caller retrieved an older pending representation.
  const current = await commercePool.query<{
    refund_reference: string | null;
    status: RoutineProOrder["status"];
  }>("SELECT status, refund_reference FROM commerce_orders WHERE id = $1", [order.id]);
  if (current.rows[0]?.status === "refunded" && current.rows[0].refund_reference === refund.id) {
    return "refunded";
  }
  throw new CommerceError("RECONCILIATION_REQUIRED");
}

export async function refundDuplicateStripePayment({
  order,
  paymentIntent,
  gateway = getStripeGateway(),
}: {
  order: RoutineProOrder;
  paymentIntent: string;
  gateway?: StripeGateway;
}): Promise<void> {
  if (order.providerPaymentRef !== paymentIntent) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
  await commercePool.query(
    `UPDATE commerce_orders SET status = 'refund_pending'
     WHERE id = $1 AND provider = 'stripe_checkout' AND provider_payment_ref = $2
       AND status = 'duplicate_paid'`,
    [order.id, paymentIntent],
  );

  let refund: Stripe.Refund;
  try {
    refund = await retrieveOrCreateStripeRefund({
      create: () =>
        gateway.createRefund(paymentIntent, `routine_pro_duplicate_refund_${order.publicRef}`),
      refundReference: order.refundReference,
      retrieve: (refundReference) => gateway.retrieveRefund(refundReference),
    });
  } catch {
    await commercePool.query(
      `UPDATE commerce_orders SET failure_code = 'DUPLICATE_REFUND_RETRY'
       WHERE id = $1 AND status IN ('duplicate_paid','refund_pending')`,
      [order.id],
    );
    throw new CommerceError("RECONCILIATION_REQUIRED", true);
  }

  const outcome = await reconcileDuplicateStripeRefund({ order, refund });
  if (outcome !== "refunded") {
    throw new CommerceError("RECONCILIATION_REQUIRED", outcome === "pending");
  }
}

export async function cancelStripeCheckout(
  order: RoutineProOrder,
  gateway: StripeGateway = getStripeGateway(),
): Promise<void> {
  const setup = await loadStripeSetupForOrder(order.id);
  if (!setup) {
    const voided = await withCommerceTransaction(async (client) => {
      await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [order.patientId]);
      const current = await client.query<{
        active_provider_setup_id: string | null;
        provider: string | null;
        status: string;
      }>(
        "SELECT provider, status, active_provider_setup_id FROM commerce_orders WHERE id = $1 FOR UPDATE",
        [order.id],
      );
      const locked = current.rows[0];
      if (
        !locked ||
        locked.provider !== "stripe_checkout" ||
        !["created", "provider_pending"].includes(locked.status) ||
        locked.active_provider_setup_id
      ) {
        return false;
      }
      const result = await client.query(
        `UPDATE commerce_orders SET status = 'voided', voided_at = now(),
           failure_code = 'CANCELLED_BEFORE_PROVIDER_SETUP'
         WHERE id = $1 AND active_provider_setup_id IS NULL
           AND status IN ('created','provider_pending')`,
        [order.id],
      );
      return result.rowCount === 1;
    });
    if (!voided) throw new CommerceError("RECONCILIATION_REQUIRED");
    return;
  }
  let providerResourceId = setup.providerResourceId;
  if (!providerResourceId) {
    const claim = await withCommerceTransaction(async (client) => {
      await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [order.patientId]);
      await client.query("SELECT id FROM commerce_orders WHERE id = $1 FOR UPDATE", [order.id]);
      const current = await client.query<SetupRow>(
        "SELECT * FROM payment_provider_setups WHERE id = $1 FOR UPDATE",
        [setup.id],
      );
      const locked = current.rows[0];
      if (!locked) return { kind: "ambiguous" as const };
      if (locked.provider_resource_id) {
        return { kind: "attached" as const, providerResourceId: locked.provider_resource_id };
      }
      if (locked.first_request_started_at || locked.status !== "prepared") {
        return { kind: "ambiguous" as const };
      }
      const terminalSetup = await client.query(
        `UPDATE payment_provider_setups SET status = 'failed_terminal',
           last_error_code = 'CANCELLED_BEFORE_PROVIDER_REQUEST'
         WHERE id = $1 AND status = 'prepared' AND first_request_started_at IS NULL
           AND provider_resource_id IS NULL`,
        [setup.id],
      );
      if (terminalSetup.rowCount !== 1) return { kind: "ambiguous" as const };
      const voidedOrder = await client.query(
        `UPDATE commerce_orders SET status = 'voided', voided_at = now(),
           failure_code = 'CANCELLED_BEFORE_PROVIDER_REQUEST'
         WHERE id = $1 AND status IN ('created','provider_pending')`,
        [order.id],
      );
      if (voidedOrder.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
      return { kind: "voided" as const };
    });
    if (claim.kind === "voided") return;
    if (claim.kind === "ambiguous") {
      await markSetupAmbiguous(setup.id, "CANCEL_REQUIRES_PROVIDER_RECONCILIATION");
      throw new CommerceError("PROVIDER_SETUP_RECONCILIATION_REQUIRED");
    }
    providerResourceId = claim.providerResourceId;
  }
  let expired: Stripe.Checkout.Session;
  try {
    expired = await gateway.expireCheckout(providerResourceId);
  } catch {
    try {
      expired = await gateway.retrieveCheckout(providerResourceId);
    } catch {
      throw new CommerceError("RECONCILIATION_REQUIRED", true);
    }
  }
  await closeDefinitivelyExpiredStripeCheckout({
    failureCode: "STRIPE_SESSION_EXPIRED_UNPAID",
    orderTerminalStatus: "voided",
    session: expired,
    setup,
  });
}
