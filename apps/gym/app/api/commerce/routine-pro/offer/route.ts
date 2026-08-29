import { getGymSession } from "@/lib/gym-session";
import { getCommerceConfig } from "@/lib/commerce/config";
import { failure, requestId, success, CommerceError } from "@/lib/commerce/http";
import { hasRoutineProEntitlement } from "@/lib/commerce/orders";
import { createRoutineProOffer } from "@/lib/commerce/quote";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    if (!getCommerceConfig().enabled) throw new CommerceError("PROVIDER_UNAVAILABLE");
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const entitled = await hasRoutineProEntitlement(active.row.patientId);
    return success(createRoutineProOffer({ sessionId: active.row.id, entitled }), id);
  } catch (error) {
    return failure(error, id);
  }
}
