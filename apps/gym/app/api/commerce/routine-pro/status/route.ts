import { GeneratedSessionSchema } from "@adaptive-world/contracts";
import { getGymSession } from "@/lib/gym-session";
import { failure, requestId, success, CommerceError } from "@/lib/commerce/http";
import { canResumeRoutineProOrderStatus } from "@/lib/commerce/constants";
import {
  getLatestRoutineProOrder,
  getOrderByPublicRefForPatient,
  getSavedRoutineRefForOrder,
  hasRoutineProEntitlement,
} from "@/lib/commerce/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function tempoExplorerUrl(provider: string, paymentRef: string | null): string | undefined {
  if (provider !== "mpp_tempo" || !paymentRef || !/^0x[0-9a-fA-F]{64}$/.test(paymentRef)) {
    return undefined;
  }
  return `https://explore.tempo.xyz/tx/${paymentRef}`;
}

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const suppliedRef = new URL(request.url).searchParams.get("order");
    if (suppliedRef && !/^awrp_[a-f0-9]{32}$/.test(suppliedRef)) {
      throw new CommerceError("INVALID_REQUEST");
    }
    const [entitled, order] = await Promise.all([
      hasRoutineProEntitlement(active.row.patientId),
      suppliedRef
        ? getOrderByPublicRefForPatient(suppliedRef, active.row.patientId)
        : getLatestRoutineProOrder(active.row.patientId),
    ]);
    const [routine, savedRoutineRef] = await Promise.all([
      Promise.resolve(GeneratedSessionSchema.safeParse(active.row.plan)),
      order ? getSavedRoutineRefForOrder(order.id) : Promise.resolve(null),
    ]);
    const explorerUrl = order ? tempoExplorerUrl(order.provider, order.providerPaymentRef) : undefined;
    return success(
      {
        entitled,
        entitlementGranted: entitled,
        ...(order
          ? {
              orderRef: order.publicRef,
              orderStatus: order.status,
              amountMinor: 499 as const,
              currency: "usd" as const,
              provider: order.provider,
              payerLabel:
                order.payerKind === "human"
                  ? ("Human test checkout" as const)
                  : ("Adaptive World demo agent" as const),
              sandbox: true as const,
              canResume: canResumeRoutineProOrderStatus(order.status),
              initialTemplateId: order.initialTemplateId,
              initialGoal: order.initialGoal,
              ...(order.providerPaymentRef
                ? { providerPaymentRef: order.providerPaymentRef.slice(0, 512) }
                : {}),
              ...(order.submittedAt ? { submittedAt: order.submittedAt.toISOString() } : {}),
              ...(order.paidAt ? { paidAt: order.paidAt.toISOString() } : {}),
              ...(order.fulfilledAt ? { fulfilledAt: order.fulfilledAt.toISOString() } : {}),
              ...(explorerUrl ? { providerExplorerUrl: explorerUrl } : {}),
              routineSaved: Boolean(savedRoutineRef),
              ...(savedRoutineRef ? { savedRoutineRef } : {}),
            }
          : {
              canResume: false,
              routineSaved: false,
            }),
        ...(routine.success ? { routine: routine.data } : {}),
      },
      id,
    );
  } catch (error) {
    return failure(error, id);
  }
}
