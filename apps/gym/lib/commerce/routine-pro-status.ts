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
  getRoutineProOrderOutcome,
  hasRoutineProEntitlement,
} from "./orders";

type ActiveGymSession = NonNullable<Awaited<ReturnType<typeof getGymSession>>>;

export async function getRoutineProStatusForActiveSession(
  active: ActiveGymSession,
  orderRef?: string,
): Promise<RoutineStatus> {
  const patientId = active.row.patientId;
  if (!patientId) throw new CommerceError("CONTEXT_REQUIRED");
  if (orderRef && !/^awrp_[a-f0-9]{32}$/u.test(orderRef)) {
    throw new CommerceError("INVALID_REQUEST");
  }

  const [entitled, order, currentPlan] = await Promise.all([
    hasRoutineProEntitlement(patientId),
    orderRef
      ? getOrderByPublicRefForPatient(orderRef, patientId)
      : getLatestRoutineProOrderForSession(patientId, active.row.id),
    commercePool.query<{ plan: unknown }>(
      "SELECT plan FROM gym_sessions WHERE id = $1 AND patient_id = $2 LIMIT 1",
      [active.row.id, patientId],
    ),
  ]);
  if (orderRef && (!order || order.gymSessionId !== active.row.id)) {
    throw new CommerceError("NOT_FOUND");
  }

  const outcome = order
    ? await getRoutineProOrderOutcome(order.id)
    : { entitlementGranted: false, savedRoutineRef: null };
  const routine = GeneratedSessionSchema.safeParse(currentPlan.rows[0]?.plan);

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
          canResume: canResumeRoutineProOrderStatus(order.status),
          ...(order.submittedAt ? { submittedAt: order.submittedAt.toISOString() } : {}),
          ...(order.paidAt ? { paidAt: order.paidAt.toISOString() } : {}),
          ...(order.fulfilledAt ? { fulfilledAt: order.fulfilledAt.toISOString() } : {}),
          ...(order.providerPaymentRef ? { providerPaymentRef: order.providerPaymentRef } : {}),
          initialGoal: order.initialGoal,
        }
      : { canResume: false }),
    routineSaved: Boolean(outcome.savedRoutineRef),
    ...(outcome.savedRoutineRef ? { savedRoutineRef: outcome.savedRoutineRef } : {}),
    ...(routine.success ? { routine: routine.data } : {}),
  });
}
