import { ConfirmRoutineRequestSchema } from "@adaptive-world/contracts";
import { getGymSession } from "@/lib/gym-session";
import { getCommerceConfig } from "@/lib/commerce/config";
import { retryPaidUnfulfilledOrder } from "@/lib/commerce/fulfillment";
import {
  assertSameOrigin,
  CommerceError,
  failure,
  parseBoundedJson,
  requestId,
  success,
} from "@/lib/commerce/http";
import {
  createOrReuseRoutineProOrder,
  getPayableOrder,
  hasRoutineProEntitlement,
} from "@/lib/commerce/orders";
import { verifyRoutineProQuote } from "@/lib/commerce/quote";
import { rateLimitPaymentOrder, rateLimitPaymentRequest } from "@/lib/commerce/rate-limit";
import { getRoutineProStatusForActiveSession } from "@/lib/commerce/routine-pro-status";
import {
  createAndSavePersonalizedRoutine,
  toRoutineIntent,
  validatePersonalizedRoutineRequest,
} from "@/lib/commerce/routines";
import { releaseStaleRoutineProOrder } from "@/lib/commerce/stale-orders";
import { createOrResumeStripeCheckout } from "@/lib/commerce/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    assertSameOrigin(request);
    const config = getCommerceConfig();
    if (!config.stripeEnabled) throw new CommerceError("PROVIDER_UNAVAILABLE");
    const parsed = ConfirmRoutineRequestSchema.safeParse(await parseBoundedJson(request));
    if (!parsed.success || parsed.data.paymentMode !== "human_checkout") {
      throw new CommerceError("INVALID_REQUEST");
    }
    const intent = toRoutineIntent(parsed.data);
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const validated = validatePersonalizedRoutineRequest({ active, intent });
    let entitled = await hasRoutineProEntitlement(active.row.patientId);
    if (!entitled) {
      const payable = await getPayableOrder(active.row.patientId);
      if (payable && payable.gymSessionId !== active.row.id) {
        if (payable.status === "paid_unfulfilled") {
          await retryPaidUnfulfilledOrder(payable.id);
          entitled = await hasRoutineProEntitlement(active.row.patientId);
          if (!entitled) throw new CommerceError("FULFILLMENT_PENDING", true);
        } else {
          await releaseStaleRoutineProOrder(payable, active.row.id);
        }
      }
    }
    const supportedModes = [
      ...(config.stripeEnabled ? (["human_checkout"] as const) : []),
      ...(config.agentEnabled ? (["agent_wallet"] as const) : []),
    ];
    if (
      !verifyRoutineProQuote({
        sessionId: active.row.id,
        entitled,
        supportedModes: [...supportedModes],
        quoteValidUntil: parsed.data.quoteValidUntil,
        quoteDigest: parsed.data.quoteDigest,
      })
    ) {
      throw new CommerceError("QUOTE_CHANGED");
    }
    await rateLimitPaymentRequest(request, { sessionId: active.row.id });
    const state = await createOrReuseRoutineProOrder({
      active,
      session: validated.session,
      intent,
      paymentMode: "human_checkout",
    });
    if (state.entitled) {
      await createAndSavePersonalizedRoutine({ active, intent });
      return success(await getRoutineProStatusForActiveSession(active), id, 200);
    }
    if (!state.order) throw new CommerceError("INTERNAL_ERROR", true);
    await rateLimitPaymentOrder(state.order.publicRef);
    const checkout = await createOrResumeStripeCheckout(state.order);
    return success(
      {
        entitled: false,
        orderRef: state.order.publicRef,
        orderStatus: state.order.status,
        payerLabel: "Human test checkout" as const,
        sandbox: true as const,
        amountMinor: 499 as const,
        currency: "usd" as const,
        initiatedVia: intent.initiatedVia,
        routine: state.session,
        checkoutUrl: checkout.checkoutUrl,
        checkoutExpiresAt: checkout.expiresAt,
        resumed: checkout.resumed,
      },
      id,
      201,
    );
  } catch (error) {
    return failure(error, id);
  }
}
