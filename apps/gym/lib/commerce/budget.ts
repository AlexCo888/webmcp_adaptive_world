import { DEMO_AGENT_SUBJECT, ROUTINE_PRO } from "./constants";
import { getCommerceConfig } from "./config";
import { withCommerceTransaction } from "./database";
import { CommerceError } from "./http";
import { canClaimMppCredentialSubmission, resolveMppTimeoutOrderTransition } from "./mpp-policy";
import type { RoutineProOrder } from "./orders";

export type AgentBudgetReservation = {
  id: string;
  orderId: string;
  amountMinor: number;
  status: "reserved" | "submitted" | "reconciliation_required" | "settled" | "released";
};

type ReservationRow = {
  id: string;
  bucket_id: string;
  order_id: string;
  amount_minor: number;
  status: AgentBudgetReservation["status"];
};

function mapReservation(row: ReservationRow): AgentBudgetReservation {
  return {
    id: row.id,
    orderId: row.order_id,
    amountMinor: row.amount_minor,
    status: row.status,
  };
}

export async function reserveAgentBudgetForOrder(
  order: RoutineProOrder,
): Promise<{ reservation: AgentBudgetReservation; reused: boolean }> {
  if (order.provider !== "mpp_tempo" || order.payerKind !== "agent") {
    throw new CommerceError("ORDER_PENDING");
  }
  const limitMinor = getCommerceConfig().dailyBudgetMinor;
  return withCommerceTransaction(async (client) => {
    const orderIdentity = await client.query<{ patient_id: string }>(
      "SELECT patient_id FROM commerce_orders WHERE id = $1",
      [order.id],
    );
    const patientId = orderIdentity.rows[0]?.patient_id;
    if (!patientId) throw new CommerceError("NOT_FOUND");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [patientId]);
    const lockedOrder = await client.query<{
      amount_minor: number;
      currency: string;
      status: string;
    }>("SELECT amount_minor, currency, status FROM commerce_orders WHERE id = $1 FOR UPDATE", [
      order.id,
    ]);
    const current = lockedOrder.rows[0];
    if (
      !current ||
      current.amount_minor !== ROUTINE_PRO.amountMinor ||
      current.currency !== ROUTINE_PRO.currency ||
      !["created", "provider_pending", "payment_submitted", "reconciliation_required"].includes(
        current.status,
      )
    ) {
      throw new CommerceError("ORDER_EXPIRED");
    }
    const bucketInsert = await client.query<{ id: string }>(
      `INSERT INTO agent_budget_buckets (
         agent_subject, budget_date, currency, limit_minor, reserved_minor, settled_minor
       ) VALUES ($1,CURRENT_DATE,$2,$3,0,0)
       ON CONFLICT (agent_subject, budget_date, currency) DO NOTHING
       RETURNING id`,
      [DEMO_AGENT_SUBJECT, ROUTINE_PRO.currency, limitMinor],
    );
    const bucket = bucketInsert.rows[0]
      ? await client.query<{
          id: string;
          limit_minor: number;
          reserved_minor: number;
          settled_minor: number;
        }>("SELECT * FROM agent_budget_buckets WHERE id = $1 FOR UPDATE", [bucketInsert.rows[0].id])
      : await client.query<{
          id: string;
          limit_minor: number;
          reserved_minor: number;
          settled_minor: number;
        }>(
          `SELECT * FROM agent_budget_buckets
           WHERE agent_subject = $1 AND budget_date = CURRENT_DATE AND currency = $2
           FOR UPDATE`,
          [DEMO_AGENT_SUBJECT, ROUTINE_PRO.currency],
        );
    const lockedBucket = bucket.rows[0];
    if (!lockedBucket) throw new CommerceError("INTERNAL_ERROR", true);
    const existing = await client.query<ReservationRow>(
      "SELECT * FROM agent_budget_reservations WHERE order_id = $1 FOR UPDATE",
      [order.id],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].status === "released") throw new CommerceError("ORDER_EXPIRED");
      return { reservation: mapReservation(existing.rows[0]), reused: true };
    }
    if (
      lockedBucket.reserved_minor + lockedBucket.settled_minor + ROUTINE_PRO.amountMinor >
      lockedBucket.limit_minor
    ) {
      throw new CommerceError("BUDGET_EXCEEDED");
    }
    const inserted = await client.query<ReservationRow>(
      `INSERT INTO agent_budget_reservations (bucket_id, order_id, amount_minor, status)
       VALUES ($1,$2,$3,'reserved') RETURNING *`,
      [lockedBucket.id, order.id, ROUTINE_PRO.amountMinor],
    );
    const reservation = inserted.rows[0];
    if (!reservation) throw new CommerceError("INTERNAL_ERROR", true);
    const increment = await client.query(
      `UPDATE agent_budget_buckets SET reserved_minor = reserved_minor + $2
       WHERE id = $1 AND reserved_minor + settled_minor + $2 <= limit_minor`,
      [lockedBucket.id, ROUTINE_PRO.amountMinor],
    );
    if (increment.rowCount !== 1) throw new CommerceError("BUDGET_EXCEEDED");
    await client.query("UPDATE commerce_orders SET budget_reservation_id = $2 WHERE id = $1", [
      order.id,
      reservation.id,
    ]);
    return { reservation: mapReservation(reservation), reused: false };
  });
}

async function transitionReservation({
  orderId,
  from,
  to,
  orderStatus,
  failureCode,
  requireFreshTransition = false,
}: {
  orderId: string;
  from: readonly AgentBudgetReservation["status"][];
  to: AgentBudgetReservation["status"];
  orderStatus: string;
  failureCode?: string;
  requireFreshTransition?: boolean;
}): Promise<AgentBudgetReservation> {
  return withCommerceTransaction(async (client) => {
    const identity = await client.query<{ bucket_id: string; patient_id: string }>(
      `SELECT abr.bucket_id, co.patient_id
       FROM agent_budget_reservations abr
       JOIN commerce_orders co ON co.id = abr.order_id
       WHERE abr.order_id = $1`,
      [orderId],
    );
    const orderIdentity = identity.rows[0];
    if (!orderIdentity) throw new CommerceError("RECONCILIATION_REQUIRED");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [
      orderIdentity.patient_id,
    ]);
    const lockedOrderResult = await client.query<{
      paid_at: Date | null;
      provider_payment_ref: string | null;
      receipt_digest: string | null;
      status: string;
    }>(
      `SELECT paid_at, provider_payment_ref, receipt_digest, status
       FROM commerce_orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const lockedOrder = lockedOrderResult.rows[0];
    if (!lockedOrder) throw new CommerceError("RECONCILIATION_REQUIRED");
    const bucketId = orderIdentity.bucket_id;
    await client.query("SELECT id FROM agent_budget_buckets WHERE id = $1 FOR UPDATE", [bucketId]);
    const reservation = await client.query<ReservationRow>(
      "SELECT * FROM agent_budget_reservations WHERE order_id = $1 FOR UPDATE",
      [orderId],
    );
    const current = reservation.rows[0];
    if (!current) throw new CommerceError("RECONCILIATION_REQUIRED");
    let effectiveOrderStatus = orderStatus;
    let effectiveFailureCode = failureCode ?? null;
    if (to === "reconciliation_required") {
      const transition = resolveMppTimeoutOrderTransition({
        orderStatus: lockedOrder.status,
        paidAt: lockedOrder.paid_at,
        providerPaymentRef: lockedOrder.provider_payment_ref,
        receiptDigest: lockedOrder.receipt_digest,
      });
      if (!transition) throw new CommerceError("RECONCILIATION_REQUIRED");
      effectiveOrderStatus = transition.status;
      effectiveFailureCode = transition.failureCode;
    }
    if (current.status === to) {
      if (requireFreshTransition) throw new CommerceError("ORDER_PENDING", true);
      if (to === "reconciliation_required" && effectiveOrderStatus === "paid_unfulfilled") {
        const preserved = await client.query(
          `UPDATE commerce_orders SET status = 'paid_unfulfilled',
             failure_code = 'FULFILLMENT_RETRY'
           WHERE id = $1 AND status IN (
             'payment_submitted','reconciliation_required','paid_unfulfilled'
           ) AND provider_payment_ref IS NOT NULL AND receipt_digest IS NOT NULL
             AND paid_at IS NOT NULL`,
          [orderId],
        );
        if (preserved.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      return mapReservation(current);
    }
    if (!from.includes(current.status)) throw new CommerceError("RECONCILIATION_REQUIRED");
    if (requireFreshTransition && !canClaimMppCredentialSubmission(current.status)) {
      throw new CommerceError("ORDER_PENDING", true);
    }
    if (to === "submitted" && lockedOrder.status !== "provider_pending") {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    const updated = await client.query<ReservationRow>(
      `UPDATE agent_budget_reservations SET status = $2,
         submitted_at = CASE WHEN $2 = 'submitted' THEN COALESCE(submitted_at, now()) ELSE submitted_at END,
         last_reconciled_at = CASE WHEN $2 = 'reconciliation_required' THEN now() ELSE last_reconciled_at END
       WHERE id = $1 AND status = ANY($3::agent_budget_reservation_status[]) RETURNING *`,
      [current.id, to, [...from]],
    );
    const changed = updated.rows[0];
    if (!changed) throw new CommerceError("RECONCILIATION_REQUIRED");
    const updatedOrder = await client.query(
      `UPDATE commerce_orders SET status = $2,
         submitted_at = CASE WHEN $2 = 'payment_submitted' THEN COALESCE(submitted_at, now()) ELSE submitted_at END,
         failure_code = $3
       WHERE id = $1 AND (
         ($2 = 'payment_submitted' AND status = 'provider_pending'
           AND provider_payment_ref IS NULL AND receipt_digest IS NULL AND paid_at IS NULL)
         OR ($2 = 'reconciliation_required' AND status IN (
           'payment_submitted','reconciliation_required'
         ) AND provider_payment_ref IS NULL AND receipt_digest IS NULL AND paid_at IS NULL)
         OR ($2 = 'paid_unfulfilled' AND status IN (
           'payment_submitted','reconciliation_required','paid_unfulfilled'
         ) AND provider_payment_ref IS NOT NULL AND receipt_digest IS NOT NULL
           AND paid_at IS NOT NULL)
       )`,
      [orderId, effectiveOrderStatus, effectiveFailureCode],
    );
    if (updatedOrder.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
    return mapReservation(changed);
  });
}

export function markAgentPaymentSubmitted(orderId: string) {
  return transitionReservation({
    orderId,
    from: ["reserved"],
    to: "submitted",
    orderStatus: "payment_submitted",
    requireFreshTransition: true,
  });
}

export function markAgentPaymentReconciliationRequired(orderId: string) {
  return transitionReservation({
    orderId,
    from: ["submitted"],
    to: "reconciliation_required",
    orderStatus: "reconciliation_required",
    failureCode: "MPP_PAYMENT_AMBIGUOUS",
  });
}

export async function releaseAgentReservationBeforeSubmission(
  orderId: string,
  reason: string,
): Promise<void> {
  await withCommerceTransaction(async (client) => {
    const identity = await client.query<{
      patient_id: string;
    }>("SELECT patient_id FROM commerce_orders WHERE id = $1", [orderId]);
    const patientId = identity.rows[0]?.patient_id;
    if (!patientId) throw new CommerceError("NOT_FOUND");
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [patientId]);
    const order = await client.query<{
      active_provider_setup_id: string | null;
      provider: string | null;
      status: string;
      submitted_at: Date | null;
    }>(
      `SELECT active_provider_setup_id, provider, status, submitted_at
       FROM commerce_orders WHERE id = $1 FOR UPDATE`,
      [orderId],
    );
    const lockedOrder = order.rows[0];
    if (
      !lockedOrder ||
      lockedOrder.provider !== "mpp_tempo" ||
      lockedOrder.status !== "provider_pending" ||
      lockedOrder.submitted_at
    ) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    const reservationIdentity = await client.query<ReservationRow>(
      "SELECT * FROM agent_budget_reservations WHERE order_id = $1",
      [orderId],
    );
    const identityRow = reservationIdentity.rows[0];
    if (!identityRow) {
      if (lockedOrder.active_provider_setup_id) {
        throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      const voided = await client.query(
        `UPDATE commerce_orders SET status = 'voided', voided_at = now(),
           failure_code = $2 WHERE id = $1 AND status = 'provider_pending'
           AND active_provider_setup_id IS NULL AND submitted_at IS NULL`,
        [orderId, reason.slice(0, 96)],
      );
      if (voided.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
      return;
    }
    // Keep the global commerce lock order: patient, order, bucket, reservation.
    await client.query("SELECT id FROM agent_budget_buckets WHERE id = $1 FOR UPDATE", [
      identityRow.bucket_id,
    ]);
    const reservation = await client.query<ReservationRow>(
      "SELECT * FROM agent_budget_reservations WHERE order_id = $1 FOR UPDATE",
      [orderId],
    );
    const row = reservation.rows[0];
    if (!row || row.bucket_id !== identityRow.bucket_id) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    if (row.status !== "reserved") throw new CommerceError("RECONCILIATION_REQUIRED");
    const released = await client.query(
      `UPDATE agent_budget_reservations SET status = 'released', released_at = now(),
         release_reason = $2 WHERE id = $1 AND status = 'reserved'`,
      [row.id, reason.slice(0, 128)],
    );
    if (released.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
    const decremented = await client.query(
      `UPDATE agent_budget_buckets SET reserved_minor = reserved_minor - $2
       WHERE id = $1 AND reserved_minor >= $2`,
      [row.bucket_id, row.amount_minor],
    );
    if (decremented.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
    const voided = await client.query(
      `UPDATE commerce_orders SET status = 'voided', voided_at = now(), failure_code = $2
       WHERE id = $1 AND status = 'provider_pending' AND submitted_at IS NULL`,
      [orderId, reason.slice(0, 96)],
    );
    if (voided.rowCount !== 1) throw new CommerceError("RECONCILIATION_REQUIRED");
  });
}
