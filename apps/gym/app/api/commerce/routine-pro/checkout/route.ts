import { ConfirmRoutineRequestSchema } from "@adaptive-world/contracts";
import { getGymSession } from "@/lib/gym-session";
import { getCommerceConfig } from "@/lib/commerce/config";
import {
  assertSameOrigin,
  CommerceError,
  failure,
  parseBoundedJson,
  requestId,
  success,
} from "@/lib/commerce/http";
import { createOrReuseRoutineProOrder, hasRoutineProEntitlement } from "@/lib/commerce/orders";
import { verifyRoutineProQuote } from "@/lib/commerce/quote";
import { rateLimitPaymentOrder, rateLimitPaymentRequest } from "@/lib/commerce/rate-limit";
import {
  prepareAgentGeneratedRoutine,
  savePreparedPersonalizedRoutine,
} from "@/lib/commerce/routines";
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
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const preparedSession = prepareAgentGeneratedRoutine({
      active,
      routine: parsed.data.routine,
      goal: parsed.data.goal,
    });
    const entitled = await hasRoutineProEntitlement(active.row.patientId);
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
      session: preparedSession,
      paymentMode: "human_checkout",
    });
    if (state.entitled) {
      const routine = await savePreparedPersonalizedRoutine({ active, session: preparedSession });
      return success({ entitled: true, ...routine }, id, routine.reused ? 200 : 201);
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
