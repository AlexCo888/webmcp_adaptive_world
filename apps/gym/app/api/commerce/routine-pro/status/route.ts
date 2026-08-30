import { GeneratedSessionSchema } from "@adaptive-world/contracts";
import { getGymSession } from "@/lib/gym-session";
import { failure, requestId, success, CommerceError } from "@/lib/commerce/http";
import { canResumeRoutineProOrderStatus } from "@/lib/commerce/constants";
import {
  getOrderByPublicRefForPatient,
  getPayableOrder,
  hasRoutineProEntitlement,
} from "@/lib/commerce/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
        : getPayableOrder(active.row.patientId),
    ]);
    const routine = GeneratedSessionSchema.safeParse(active.row.plan);
    return success(
      {
        entitled,
        ...(order
          ? {
              orderRef: order.publicRef,
              orderStatus: order.status,
              payerLabel:
                order.payerKind === "human"
                  ? ("Human test checkout" as const)
                  : ("Adaptive World demo agent" as const),
              canResume: canResumeRoutineProOrderStatus(order.status),
              initialTemplateId: order.initialTemplateId,
              initialGoal: order.initialGoal,
            }
          : {}),
        ...(routine.success ? { routine: routine.data } : {}),
      },
      id,
    );
  } catch (error) {
    return failure(error, id);
  }
}
