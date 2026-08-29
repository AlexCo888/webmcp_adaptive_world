import { z } from "zod";
import { getGymSession } from "@/lib/gym-session";
import { releaseAgentReservationBeforeSubmission } from "@/lib/commerce/budget";
import {
  assertSameOrigin,
  CommerceError,
  failure,
  parseBoundedJson,
  requestId,
  success,
} from "@/lib/commerce/http";
import { getOrderByPublicRefForPatient } from "@/lib/commerce/orders";
import { rateLimitPaymentRequest } from "@/lib/commerce/rate-limit";
import { cancelStripeCheckout } from "@/lib/commerce/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CancelSchema = z.object({ orderRef: z.string().regex(/^awrp_[a-f0-9]{32}$/) }).strict();

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    assertSameOrigin(request);
    const parsed = CancelSchema.safeParse(await parseBoundedJson(request));
    if (!parsed.success) throw new CommerceError("INVALID_REQUEST");
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const order = await getOrderByPublicRefForPatient(parsed.data.orderRef, active.row.patientId);
    if (!order) throw new CommerceError("NOT_FOUND");
    await rateLimitPaymentRequest(request, {
      sessionId: active.row.id,
      orderRef: order.publicRef,
      agent: order.payerKind === "agent",
    });
    if (order.provider === "stripe_checkout") {
      await cancelStripeCheckout(order);
    } else {
      if (order.status !== "provider_pending") throw new CommerceError("RECONCILIATION_REQUIRED");
      await releaseAgentReservationBeforeSubmission(order.id, "owner_cancelled_before_submission");
    }
    return success({ cancelled: true }, id);
  } catch (error) {
    return failure(error, id);
  }
}
