import { sha256Hex } from "@adaptive-world/security";
import type { PoolClient } from "@adaptive-world/db";
import { ROUTINE_PRO } from "./constants";
import { commercePool, withCommerceTransaction } from "./database";
import { CommerceError } from "./http";

export type FulfillmentInput = {
  orderId: string;
  provider: "stripe_checkout" | "mpp_tempo";
  providerPaymentRef: string;
  receiptDigest: string;
  paidAmountMinor: number;
  paidCurrency: string;
  paidAt: Date;
  providerEventId: string;
};

export type FulfillmentResult = {
  outcome: "fulfilled" | "idempotent" | "duplicate_paid";
  entitlementId: string;
  sourceOrderId: string;
  duplicateOfOrderId?: string;
};

export async function persistVerifiedPaymentEvidence(input: FulfillmentInput): Promise<void> {
  if (
    input.paidAmountMinor !== ROUTINE_PRO.amountMinor ||
    input.paidCurrency.toLowerCase() !== ROUTINE_PRO.currency ||
    !/^[0-9a-f]{64}$/u.test(input.receiptDigest)
  ) {
    throw new CommerceError("PRICE_MISMATCH");
  }
  await withCommerceTransaction(async (client) => {
    const identity = await client.query<{ patient_id: string }>(
      "SELECT patient_id FROM commerce_orders WHERE id = $1",
      [input.orderId],
    );
    const patientId = identity.rows[0]?.patient_id;
    if (!patientId) throw new CommerceError("NOT_FOUND");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [patientId]);
    const locked = await client.query<{
      amount_minor: number;
      currency: string;
      paid_at: Date | null;
      product_key: string;
      provider: FulfillmentInput["provider"];
      provider_payment_ref: string | null;
      receipt_digest: string | null;
      status: string;
    }>("SELECT * FROM commerce_orders WHERE id = $1 FOR UPDATE", [input.orderId]);
    const order = locked.rows[0];
    if (
      !order ||
      order.provider !== input.provider ||
      order.product_key !== ROUTINE_PRO.productKey ||
      order.amount_minor !== input.paidAmountMinor ||
      order.currency !== input.paidCurrency.toLowerCase()
    ) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    if (
      (order.provider_payment_ref && order.provider_payment_ref !== input.providerPaymentRef) ||
      (order.receipt_digest && order.receipt_digest !== input.receiptDigest) ||
      (order.paid_at && order.paid_at.getTime() !== input.paidAt.getTime())
    ) {
      throw new CommerceError("PAYMENT_REPLAY");
    }
    if (["fulfilled", "duplicate_paid", "refund_pending", "refunded"].includes(order.status)) {
      if (!order.provider_payment_ref || !order.receipt_digest || !order.paid_at) {
        throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      return;
    }
    if (
      ![
        "provider_pending",
        "payment_submitted",
        "reconciliation_required",
        "paid_unfulfilled",
      ].includes(order.status)
    ) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    const persisted = await client.query(
      `UPDATE commerce_orders
       SET provider_payment_ref = COALESCE(provider_payment_ref, $2),
           receipt_digest = COALESCE(receipt_digest, $3),
           paid_at = COALESCE(paid_at, $4), status = 'paid_unfulfilled',
           failure_code = 'FULFILLMENT_RETRY'
       WHERE id = $1
         AND (provider_payment_ref IS NULL OR provider_payment_ref = $2)
         AND (receipt_digest IS NULL OR receipt_digest = $3)
         AND (paid_at IS NULL OR paid_at = $4)`,
      [input.orderId, input.providerPaymentRef, input.receiptDigest, input.paidAt],
    );
    if (persisted.rowCount !== 1) throw new CommerceError("PAYMENT_REPLAY");
  });
}

export async function retryPaidUnfulfilledOrder(orderId: string): Promise<FulfillmentResult> {
  const evidence = await commercePool.query<{
    amount_minor: number;
    currency: string;
    paid_at: Date | null;
    provider: FulfillmentInput["provider"];
    provider_event_id: string | null;
    provider_payment_ref: string | null;
    receipt_digest: string | null;
  }>(
    `SELECT co.provider, co.provider_payment_ref, co.receipt_digest, co.paid_at,
       co.amount_minor, co.currency, event.provider_event_id
     FROM commerce_orders co
     LEFT JOIN LATERAL (
       SELECT provider_event_id FROM payment_provider_events
       WHERE order_id = co.id AND provider = co.provider AND processed_at IS NULL
       ORDER BY received_at ASC LIMIT 1
     ) event ON true
     WHERE co.id = $1 AND co.status = 'paid_unfulfilled'
     LIMIT 1`,
    [orderId],
  );
  const row = evidence.rows[0];
  if (!row?.provider_payment_ref || !row.receipt_digest || !row.paid_at || !row.provider_event_id) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
  return fulfillRoutineProOrder({
    orderId,
    provider: row.provider,
    providerPaymentRef: row.provider_payment_ref,
    receiptDigest: row.receipt_digest,
    paidAmountMinor: row.amount_minor,
    paidCurrency: row.currency,
    paidAt: row.paid_at,
    providerEventId: row.provider_event_id,
  });
}

export async function digestProviderEvidence(parts: readonly string[]): Promise<string> {
  return sha256Hex(parts.join("|"));
}

export async function recordProviderEvent({
  provider,
  providerEventId,
  orderId,
  eventType,
  payloadDigest,
}: {
  provider: FulfillmentInput["provider"];
  providerEventId: string;
  orderId: string;
  eventType: string;
  payloadDigest: string;
}): Promise<{ inserted: boolean }> {
  const result = await commercePool.query<{ id: string }>(
    `INSERT INTO payment_provider_events (
       provider, provider_event_id, order_id, event_type, payload_digest
     ) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (provider, provider_event_id) DO NOTHING
     RETURNING id`,
    [provider, providerEventId, orderId, eventType, payloadDigest],
  );
  if (result.rowCount === 1) return { inserted: true };
  const existing = await commercePool.query<{
    event_type: string;
    order_id: string;
    payload_digest: string;
  }>(
    `SELECT order_id, event_type, payload_digest
     FROM payment_provider_events
     WHERE provider = $1 AND provider_event_id = $2
     LIMIT 1`,
    [provider, providerEventId],
  );
  const row = existing.rows[0];
  if (
    !row ||
    row.order_id !== orderId ||
    row.event_type !== eventType ||
    row.payload_digest !== payloadDigest
  ) {
    throw new CommerceError("PAYMENT_REPLAY");
  }
  return { inserted: false };
}

export async function markProviderEventProcessed({
  outcome,
  provider,
  providerEventId,
}: {
  outcome: string;
  provider: FulfillmentInput["provider"];
  providerEventId: string;
}): Promise<void> {
  const updated = await commercePool.query(
    `UPDATE payment_provider_events
     SET processed_at = COALESCE(processed_at, now()), outcome = $3
     WHERE provider = $1 AND provider_event_id = $2`,
    [provider, providerEventId, outcome.slice(0, 96)],
  );
  if (updated.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
}

async function settleAgentReservation(client: PoolClient, orderId: string): Promise<void> {
  const identity = await client.query<{
    id: string;
    bucket_id: string;
  }>("SELECT id, bucket_id FROM agent_budget_reservations WHERE order_id = $1", [orderId]);
  const reservationIdentity = identity.rows[0];
  if (!reservationIdentity) return;
  await client.query("SELECT id FROM agent_budget_buckets WHERE id = $1 FOR UPDATE", [
    reservationIdentity.bucket_id,
  ]);
  const reservation = await client.query<{
    id: string;
    bucket_id: string;
    amount_minor: number;
    status: string;
  }>("SELECT * FROM agent_budget_reservations WHERE order_id = $1 FOR UPDATE", [orderId]);
  const row = reservation.rows[0];
  if (!row || row.status === "settled") return;
  if (!["reserved", "submitted", "reconciliation_required"].includes(row.status)) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
  const bucket = await client.query(
    `UPDATE agent_budget_buckets
     SET reserved_minor = reserved_minor - $2, settled_minor = settled_minor + $2
     WHERE id = $1 AND reserved_minor >= $2`,
    [row.bucket_id, row.amount_minor],
  );
  if (bucket.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
  await client.query(
    `UPDATE agent_budget_reservations
     SET status = 'settled', settled_at = COALESCE(settled_at, now()) WHERE id = $1`,
    [row.id],
  );
}

export async function fulfillRoutineProOrder(input: FulfillmentInput): Promise<FulfillmentResult> {
  if (
    input.paidAmountMinor !== ROUTINE_PRO.amountMinor ||
    input.paidCurrency.toLowerCase() !== ROUTINE_PRO.currency
  ) {
    throw new CommerceError("PRICE_MISMATCH");
  }
  if (!/^[0-9a-f]{64}$/.test(input.receiptDigest)) {
    throw new CommerceError("INVALID_REQUEST");
  }

  return withCommerceTransaction(async (client) => {
    const identity = await client.query<{ patient_id: string }>(
      "SELECT patient_id FROM commerce_orders WHERE id = $1",
      [input.orderId],
    );
    const patientId = identity.rows[0]?.patient_id;
    if (!patientId) throw new CommerceError("NOT_FOUND");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [patientId]);
    const locked = await client.query<{
      id: string;
      provider: FulfillmentInput["provider"];
      amount_minor: number;
      currency: string;
      product_key: string;
      status: string;
      provider_payment_ref: string | null;
      receipt_digest: string | null;
      paid_at: Date | null;
      duplicate_of_order_id: string | null;
    }>("SELECT * FROM commerce_orders WHERE id = $1 FOR UPDATE", [input.orderId]);
    const order = locked.rows[0];
    if (
      !order ||
      order.provider !== input.provider ||
      order.product_key !== ROUTINE_PRO.productKey
    ) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    if (
      order.amount_minor !== input.paidAmountMinor ||
      order.currency !== input.paidCurrency.toLowerCase()
    ) {
      throw new CommerceError("PRICE_MISMATCH");
    }
    if (
      (order.provider_payment_ref && order.provider_payment_ref !== input.providerPaymentRef) ||
      (order.receipt_digest && order.receipt_digest !== input.receiptDigest) ||
      (order.paid_at && order.paid_at.getTime() !== input.paidAt.getTime())
    ) {
      throw new CommerceError("PAYMENT_REPLAY");
    }

    const terminalSourceOrderId =
      order.status === "fulfilled"
        ? order.id
        : ["duplicate_paid", "refund_pending", "refunded"].includes(order.status)
          ? order.duplicate_of_order_id
          : null;
    if (terminalSourceOrderId) {
      const terminalEntitlement = await client.query<{
        id: string;
        source_order_id: string;
      }>(
        `SELECT id, source_order_id FROM entitlement_grants
         WHERE patient_id = $1 AND entitlement_key = $2 AND source_order_id = $3
         FOR UPDATE`,
        [patientId, ROUTINE_PRO.entitlementKey, terminalSourceOrderId],
      );
      const source = terminalEntitlement.rows[0];
      if (!source || !order.provider_payment_ref || !order.receipt_digest || !order.paid_at) {
        throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      await client.query(
        `UPDATE payment_provider_events SET processed_at = COALESCE(processed_at, now()),
           outcome = 'idempotent' WHERE provider = $1 AND provider_event_id = $2`,
        [input.provider, input.providerEventId],
      );
      return {
        outcome: "idempotent",
        entitlementId: source.id,
        sourceOrderId: source.source_order_id,
        ...(order.duplicate_of_order_id ? { duplicateOfOrderId: order.duplicate_of_order_id } : {}),
      };
    }

    if (["fulfilled", "duplicate_paid", "refund_pending", "refunded"].includes(order.status)) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }

    if (input.provider === "mpp_tempo") await settleAgentReservation(client, order.id);

    const entitlement = await client.query<{
      id: string;
      source_order_id: string;
      status: "active" | "revoked";
    }>(
      `SELECT id, source_order_id, status FROM entitlement_grants
       WHERE patient_id = $1 AND entitlement_key = $2 AND status = 'active'
       FOR UPDATE`,
      [patientId, ROUTINE_PRO.entitlementKey],
    );
    const active = entitlement.rows[0];
    if (active?.source_order_id === order.id) {
      await client.query(
        `UPDATE payment_provider_events SET processed_at = COALESCE(processed_at, now()),
           outcome = 'idempotent' WHERE provider = $1 AND provider_event_id = $2`,
        [input.provider, input.providerEventId],
      );
      return {
        outcome: "idempotent",
        entitlementId: active.id,
        sourceOrderId: active.source_order_id,
      };
    }

    if (active) {
      await client.query(
        `UPDATE commerce_orders SET status = 'duplicate_paid', provider_payment_ref = $2,
           receipt_digest = $3, paid_at = $4, duplicate_of_order_id = $5
         WHERE id = $1`,
        [
          order.id,
          input.providerPaymentRef,
          input.receiptDigest,
          input.paidAt,
          active.source_order_id,
        ],
      );
      await client.query(
        `UPDATE payment_provider_events SET processed_at = now(), outcome = 'duplicate_paid'
         WHERE provider = $1 AND provider_event_id = $2`,
        [input.provider, input.providerEventId],
      );
      return {
        outcome: "duplicate_paid",
        entitlementId: active.id,
        sourceOrderId: active.source_order_id,
        duplicateOfOrderId: active.source_order_id,
      };
    }

    const granted = await client.query<{ id: string }>(
      `INSERT INTO entitlement_grants (
         patient_id, entitlement_key, source_order_id, status, granted_at
       ) VALUES ($1,$2,$3,'active',$4) RETURNING id`,
      [patientId, ROUTINE_PRO.entitlementKey, order.id, input.paidAt],
    );
    const entitlementId = granted.rows[0]?.id;
    if (!entitlementId) throw new CommerceError("FULFILLMENT_PENDING", true);
    await client.query(
      `UPDATE commerce_orders SET status = 'fulfilled', provider_payment_ref = $2,
         receipt_digest = $3, paid_at = $4, fulfilled_at = now(), failure_code = NULL
       WHERE id = $1`,
      [order.id, input.providerPaymentRef, input.receiptDigest, input.paidAt],
    );
    await client.query(
      `UPDATE payment_provider_events SET processed_at = now(), outcome = 'fulfilled'
       WHERE provider = $1 AND provider_event_id = $2`,
      [input.provider, input.providerEventId],
    );
    await client.query(
      `INSERT INTO audit_events (
         patient_id, action, resource_type, resource_id, outcome, metadata
       ) VALUES ($1,'commerce.entitlement.granted','entitlement_grant',$2,'success',$3::jsonb)`,
      [
        patientId,
        entitlementId,
        JSON.stringify({
          publicRefOnly: true,
          productKey: ROUTINE_PRO.productKey,
          provider: input.provider,
          amountMinor: ROUTINE_PRO.amountMinor,
          currency: ROUTINE_PRO.currency,
          sandbox: true,
        }),
      ],
    );
    return { outcome: "fulfilled", entitlementId, sourceOrderId: order.id };
  });
}

export async function markPaidUnfulfilled(
  orderId: string,
  eventId: string,
  options: { failureCode?: string; reconciliation?: boolean } = {},
): Promise<void> {
  const status = options.reconciliation ? "reconciliation_required" : "paid_unfulfilled";
  const failureCode = (options.failureCode ?? "FULFILLMENT_RETRY").slice(0, 96);
  await commercePool.query(
    `UPDATE commerce_orders SET status = $2::commerce_order_status, failure_code = $3
     WHERE id = $1 AND status IN (
       'provider_pending','payment_submitted','reconciliation_required','paid_unfulfilled'
     )`,
    [orderId, status, failureCode],
  );
  await commercePool.query(
    `UPDATE payment_provider_events SET outcome = $2
     WHERE provider_event_id = $1 AND processed_at IS NULL`,
    [eventId, options.reconciliation ? "reconciliation_required" : "fulfillment_pending"],
  );
}
