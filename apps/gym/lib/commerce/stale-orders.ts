import { releaseAgentReservationBeforeSubmission } from "./budget";
import { commercePool } from "./database";
import { CommerceError } from "./http";
import type { RoutineProOrder } from "./orders";
import { cancelStripeCheckout } from "./stripe";

const PRE_SUBMISSION_STATES = new Set(["created", "provider_pending"]);

/**
 * A patient may hold only one payable Routine Pro order. When a person
 * reconnects with a new one-use context, an abandoned pre-submission order
 * from the earlier Gym session must not strand the new session. Such an order
 * has no submitted payment, so it is released the same way the owner's
 * explicit cancel would release it; orders with a submitted or verified
 * payment are never touched here and must be reconciled instead.
 */
export async function releaseStaleRoutineProOrder(
  order: RoutineProOrder,
  activeGymSessionId: string,
): Promise<boolean> {
  if (order.gymSessionId === activeGymSessionId || !PRE_SUBMISSION_STATES.has(order.status)) {
    return false;
  }
  if (order.provider === "stripe_checkout") {
    await cancelStripeCheckout(order);
  } else {
    if (order.status !== "provider_pending") throw new CommerceError("RECONCILIATION_REQUIRED");
    await releaseAgentReservationBeforeSubmission(order.id, "superseded_by_new_gym_session");
  }
  await commercePool.query(
    `INSERT INTO audit_events (
       patient_id, action, resource_type, resource_id, outcome, metadata
     ) VALUES ($1,'commerce.order.released_stale','commerce_order',$2,'success',$3::jsonb)`,
    [
      order.patientId,
      order.id,
      JSON.stringify({
        publicRef: order.publicRef,
        provider: order.provider,
        previousStatus: order.status,
        reason: "superseded_by_new_gym_session",
      }),
    ],
  );
  return true;
}
