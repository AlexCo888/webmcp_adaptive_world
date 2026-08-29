import type Stripe from "stripe";
import { ROUTINE_PRO } from "@/lib/commerce/constants";
import {
  digestProviderEvidence,
  fulfillRoutineProOrder,
  markPaidUnfulfilled,
  markProviderEventProcessed,
  persistVerifiedPaymentEvidence,
  recordProviderEvent,
} from "@/lib/commerce/fulfillment";
import { CommerceError, failure, requestId, success } from "@/lib/commerce/http";
import {
  getOrderByPublicRefInternal,
  getStripeOrderByPaymentIntentInternal,
} from "@/lib/commerce/orders";
import {
  closeDefinitivelyExpiredStripeCheckout,
  constructStripeWebhookEvent,
  getStripeGateway,
  loadStripeSetupForOrder,
  reconcileDuplicateStripeRefund,
  refundDuplicateStripePayment,
} from "@/lib/commerce/stripe";
import {
  resolveStripeDuplicateRefund,
  shouldAttemptDuplicateStripeRefund,
  stripeRefundPaymentIntentId,
} from "@/lib/commerce/stripe-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : (session.payment_intent?.id ?? null);
}

export async function POST(request: Request) {
  const id = requestId(request);
  let durableOrderId: string | undefined;
  let durableEventId: string | undefined;
  try {
    const signature = request.headers.get("stripe-signature");
    if (!signature) throw new CommerceError("INVALID_REQUEST");
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 1_048_576) {
      throw new CommerceError("INVALID_REQUEST");
    }
    const event = constructStripeWebhookEvent(rawBody, signature);
    if (
      event.type === "refund.created" ||
      event.type === "refund.updated" ||
      event.type === "refund.failed"
    ) {
      if (event.livemode !== false) throw new CommerceError("RECONCILIATION_REQUIRED");
      const eventRefund = event.data.object;
      const refundPaymentIntent = stripeRefundPaymentIntentId(eventRefund);
      if (!refundPaymentIntent) throw new CommerceError("RECONCILIATION_REQUIRED");
      const refundOrder = await getStripeOrderByPaymentIntentInternal(refundPaymentIntent);
      if (!refundOrder) throw new CommerceError("RECONCILIATION_REQUIRED");
      if (
        !resolveStripeDuplicateRefund({ order: refundOrder, refund: eventRefund }).persistReference
      ) {
        throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      const payloadDigest = await digestProviderEvidence([rawBody]);
      await recordProviderEvent({
        provider: "stripe_checkout",
        providerEventId: event.id,
        orderId: refundOrder.id,
        eventType: event.type,
        payloadDigest,
      });

      let currentRefund: Stripe.Refund;
      try {
        currentRefund = await getStripeGateway().retrieveRefund(eventRefund.id);
      } catch {
        throw new CommerceError("RECONCILIATION_REQUIRED", true);
      }
      if (currentRefund.id !== eventRefund.id) {
        throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      const refundOutcome = await reconcileDuplicateStripeRefund({
        order: refundOrder,
        refund: currentRefund,
      });
      await markProviderEventProcessed({
        outcome: `stripe_refund_${refundOutcome}`,
        provider: "stripe_checkout",
        providerEventId: event.id,
      });
      return success({ received: true, outcome: refundOutcome }, id);
    }
    if (
      event.type === "checkout.session.expired" ||
      event.type === "checkout.session.async_payment_failed"
    ) {
      const expiredSession = event.data.object;
      const expiredPublicRef = expiredSession.metadata?.publicRef;
      if (
        !expiredPublicRef ||
        event.livemode !== false ||
        expiredSession.livemode !== false ||
        expiredSession.client_reference_id !== expiredPublicRef ||
        expiredSession.metadata?.productKey !== ROUTINE_PRO.productKey ||
        expiredSession.metadata?.sandbox !== "true" ||
        expiredSession.mode !== "payment"
      ) {
        throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      const expiredOrder = await getOrderByPublicRefInternal(expiredPublicRef);
      if (!expiredOrder || expiredOrder.provider !== "stripe_checkout") {
        throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      const expiredSetup = await loadStripeSetupForOrder(expiredOrder.id);
      if (!expiredSetup || expiredSetup.providerResourceId !== expiredSession.id) {
        throw new CommerceError("RECONCILIATION_REQUIRED");
      }
      await closeDefinitivelyExpiredStripeCheckout({
        failureCode:
          event.type === "checkout.session.expired"
            ? "STRIPE_SESSION_EXPIRED_UNPAID"
            : "STRIPE_ASYNC_PAYMENT_FAILED",
        orderTerminalStatus: "expired",
        providerOutcome:
          event.type === "checkout.session.expired" ? "expired" : "async_payment_failed",
        session: expiredSession,
        setup: expiredSetup,
      });
      return success({ received: true, outcome: "expired" }, id);
    }
    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return success({ received: true, ignored: true }, id);
    }
    const session = event.data.object;
    const publicRef = session.metadata?.publicRef;
    if (
      !publicRef ||
      event.livemode !== false ||
      session.livemode !== false ||
      session.client_reference_id !== publicRef ||
      session.metadata?.productKey !== ROUTINE_PRO.productKey ||
      session.metadata?.sandbox !== "true" ||
      session.mode !== "payment"
    ) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    const order = await getOrderByPublicRefInternal(publicRef);
    if (!order || order.provider !== "stripe_checkout") {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    const setup = await loadStripeSetupForOrder(order.id);
    if (!setup || setup.providerResourceId !== session.id || setup.status !== "attached") {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    if (session.payment_status !== "paid") throw new CommerceError("PAYMENT_FAILED");
    const paymentIntent = paymentIntentId(session);
    if (!paymentIntent) throw new CommerceError("RECONCILIATION_REQUIRED");
    const payloadDigest = await digestProviderEvidence([rawBody]);
    await recordProviderEvent({
      provider: "stripe_checkout",
      providerEventId: event.id,
      orderId: order.id,
      eventType: event.type,
      payloadDigest,
    });
    durableOrderId = order.id;
    durableEventId = event.id;
    if (
      session.amount_total !== ROUTINE_PRO.amountMinor ||
      session.currency !== ROUTINE_PRO.currency
    ) {
      throw new CommerceError("PRICE_MISMATCH");
    }
    const lines = await getStripeGateway().listLineItems(session.id);
    if (
      lines.data.length !== 1 ||
      lines.data[0]?.price?.id !== setup.requestParams.line_items[0].price ||
      lines.data[0]?.price?.livemode !== false ||
      lines.data[0]?.quantity !== 1
    ) {
      throw new CommerceError("PRICE_MISMATCH");
    }
    const receiptDigest = await digestProviderEvidence([
      event.id,
      session.id,
      paymentIntent,
      String(session.amount_total),
      session.currency,
    ]);
    await persistVerifiedPaymentEvidence({
      orderId: order.id,
      provider: "stripe_checkout",
      providerPaymentRef: paymentIntent,
      receiptDigest,
      paidAmountMinor: session.amount_total,
      paidCurrency: session.currency,
      paidAt: new Date(event.created * 1_000),
      providerEventId: event.id,
    });
    const result = await fulfillRoutineProOrder({
      orderId: order.id,
      provider: "stripe_checkout",
      providerPaymentRef: paymentIntent,
      receiptDigest,
      paidAmountMinor: session.amount_total,
      paidCurrency: session.currency,
      paidAt: new Date(event.created * 1_000),
      providerEventId: event.id,
    });
    const latestOrder = await getOrderByPublicRefInternal(publicRef);
    if (latestOrder && shouldAttemptDuplicateStripeRefund(result.outcome, latestOrder)) {
      // This also closes the crash window between durable duplicate fulfillment
      // and the first refund call. Stripe receives the same refund idempotency
      // key on every recovery attempt.
      await refundDuplicateStripePayment({ order: latestOrder, paymentIntent });
    }
    return success({ received: true, outcome: result.outcome }, id);
  } catch (error) {
    if (durableOrderId && durableEventId) {
      const code = error instanceof CommerceError ? error.code : "INTERNAL_ERROR";
      await markPaidUnfulfilled(durableOrderId, durableEventId, {
        failureCode: code,
        reconciliation: ["PRICE_MISMATCH", "PAYMENT_REPLAY", "RECONCILIATION_REQUIRED"].includes(
          code,
        ),
      }).catch(() => undefined);
    }
    return failure(error, id);
  }
}
