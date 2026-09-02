import {
  GeneratedSessionSchema,
  RoutineStatusSchema,
  type RoutineStatus,
} from "@adaptive-world/contracts";
import type { getGymSession } from "@/lib/gym-session";
import { canResumeRoutineProOrderStatus, ROUTINE_PRO } from "./constants";
import { commercePool } from "./database";
import { CommerceError } from "./http";
import {
  getLatestRoutineProOrderForSession,
  getOrderByPublicRefForPatient,
  getPayableOrder,
  getRoutineProOrderOutcome,
  getSavedRoutineById,
  getSavedRoutineForSession,
  hasRoutineProEntitlement,
} from "./orders";

type ActiveGymSession = NonNullable<Awaited<ReturnType<typeof getGymSession>>>;

/**
 * Projects the durable order, entitlement, and saved-routine records for the
 * active Gym session into the bounded status shape shared by the site UI, the
 * status API, and the read-only WebMCP recovery tool. It reads only; it never
 * touches a payment rail, and it never exposes credentials or raw receipts.
 */
export async function getRoutineProStatusForActiveSession(
  active: ActiveGymSession,
  orderRef?: string,
): Promise<RoutineStatus> {
  const patientId = active.row.patientId;
  if (!patientId) throw new CommerceError("CONTEXT_REQUIRED");
  if (orderRef && !/^awrp_[a-f0-9]{32}$/u.test(orderRef)) {
    throw new CommerceError("INVALID_REQUEST");
  }

  // The active session's latest order wins. Without one, a payable order left
  // by an earlier Gym session of the same patient is surfaced too: only one
  // payable order may exist per patient, so it is the blocker a new session
  // must be able to see, recover, or release.
  const [entitled, order, currentPlan, saved] = await Promise.all([
    hasRoutineProEntitlement(patientId),
    orderRef
      ? getOrderByPublicRefForPatient(orderRef, patientId)
      : getLatestRoutineProOrderForSession(patientId, active.row.id).then(
          (sessionOrder) => sessionOrder ?? getPayableOrder(patientId),
        ),
    commercePool.query<{ plan: unknown }>(
      "SELECT plan FROM gym_sessions WHERE id = $1 AND patient_id = $2 LIMIT 1",
      [active.row.id, patientId],
    ),
    getSavedRoutineForSession(patientId, active.row.id),
  ]);
  if (orderRef && !order) throw new CommerceError("NOT_FOUND");

  const outcome = order
    ? await getRoutineProOrderOutcome(order.id)
    : { entitlementGranted: false, savedRoutineRef: null };

  // The saved routine and plan must belong to the order being reported. A
  // routine the selected order fulfilled always wins; the active session's own
  // saved or staged plan is used only when the order is this session's (or no
  // order exists), never for an earlier session's receipt.
  const orderIsActiveSession = !order || order.gymSessionId === active.row.id;
  const orderSaved =
    outcome.savedRoutineRef && outcome.savedRoutineRef !== saved?.id
      ? await getSavedRoutineById(patientId, outcome.savedRoutineRef)
      : outcome.savedRoutineRef
        ? saved
        : null;
  const savedRoutineRef = orderSaved?.id ?? (orderIsActiveSession ? saved?.id : undefined);
  const savedPlan = GeneratedSessionSchema.safeParse(
    orderSaved?.plan ?? (orderIsActiveSession ? saved?.plan : undefined),
  );
  const stagedPlan = GeneratedSessionSchema.safeParse(
    orderIsActiveSession ? currentPlan.rows[0]?.plan : undefined,
  );
  const routine = savedPlan.success
    ? savedPlan.data
    : stagedPlan.success
      ? stagedPlan.data
      : undefined;

  return RoutineStatusSchema.parse({
    entitled,
    entitlementGranted: entitled || outcome.entitlementGranted,
    ...(order
      ? {
          orderRef: order.publicRef,
          orderStatus: order.status,
          amountMinor: ROUTINE_PRO.amountMinor,
          currency: ROUTINE_PRO.currency,
          provider: order.provider,
          payerLabel:
            order.payerKind === "human"
              ? ("Human test checkout" as const)
              : ("Adaptive World demo agent" as const),
          sandbox: true as const,
          initiatedVia: order.initiatedVia,
          orderScope: order.gymSessionId === active.row.id ? "active_session" : "earlier_session",
          canResume: canResumeRoutineProOrderStatus(order.status),
          ...(order.submittedAt ? { submittedAt: order.submittedAt.toISOString() } : {}),
          ...(order.paidAt ? { paidAt: order.paidAt.toISOString() } : {}),
          ...(order.fulfilledAt ? { fulfilledAt: order.fulfilledAt.toISOString() } : {}),
          ...(order.providerPaymentRef ? { providerPaymentRef: order.providerPaymentRef } : {}),
          initialGoal: order.initialGoal,
        }
      : { canResume: false }),
    routineSaved: Boolean(savedRoutineRef),
    ...(savedRoutineRef ? { savedRoutineRef } : {}),
    ...(routine ? { routine } : {}),
  });
}
