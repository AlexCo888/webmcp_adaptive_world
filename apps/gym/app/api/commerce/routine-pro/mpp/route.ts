import { digestRoutineProCapability, sha256Hex } from "@adaptive-world/security";
import {
  digestProviderEvidence,
  fulfillRoutineProOrder,
  markPaidUnfulfilled,
  persistVerifiedPaymentEvidence,
  recordProviderEvent,
  retryPaidUnfulfilledOrder,
} from "@/lib/commerce/fulfillment";
import { getCommerceConfig } from "@/lib/commerce/config";
import { safeAgentPaymentFailureCause } from "@/lib/commerce/agent-pay-diagnostics";
import { CommerceError, failure, requestId } from "@/lib/commerce/http";
import { resolveMppMerchantAction } from "@/lib/commerce/mpp-policy";
import {
  attachMppChallenge,
  getPreparedMppOrderByCapabilityDigest,
} from "@/lib/commerce/mpp-order";
import {
  createTempoMerchantAdapter,
  MPP_PAYMENT_CREDENTIAL_HEADER,
  MppAdapterError,
} from "@/lib/commerce/mpp";
import { mppAtomicStore, mppConfigForSnapshot } from "@/lib/commerce/mpp-runtime";
import { rateLimitPaymentRequest } from "@/lib/commerce/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function protocolJson(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
    },
  });
}

function capabilityFrom(request: Request): string {
  const matched = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/u);
  if (!matched?.[1]) throw new CommerceError("PAYMENT_FAILED");
  return matched[1];
}

function asCommerceError(error: unknown): CommerceError {
  if (!(error instanceof MppAdapterError)) {
    return error instanceof CommerceError ? error : new CommerceError("INTERNAL_ERROR", true);
  }
  const code =
    error.safeCode === "INVALID_PAYMENT_SNAPSHOT" ? "RECONCILIATION_REQUIRED" : error.safeCode;
  return new CommerceError(code, error.retryable);
}

export async function POST(request: Request) {
  const id = requestId(request);
  let stage = "read_capability";
  try {
    const capability = capabilityFrom(request);
    stage = "digest_capability";
    const capabilityDigest = await digestRoutineProCapability(capability);
    stage = "load_prepared_order";
    const prepared = await getPreparedMppOrderByCapabilityDigest(capabilityDigest);
    if (!prepared) throw new CommerceError("PAYMENT_FAILED");

    stage = "resolve_action";
    const hasCredential = request.headers.has(MPP_PAYMENT_CREDENTIAL_HEADER);
    const action = resolveMppMerchantAction({
      agentPaymentsEnabled: getCommerceConfig().agentEnabled,
      hasCredential,
      orderStatus: prepared.orderStatus,
    });
    stage = "rate_limit_request";
    await rateLimitPaymentRequest(request, {
      sessionId: prepared.gymSessionId,
      orderRef: prepared.publicRef,
      agent: true,
    });

    if (action === "recover_fulfillment") {
      const recovered = await retryPaidUnfulfilledOrder(prepared.orderId);
      return protocolJson({
        ok: true,
        data: {
          orderRef: prepared.publicRef,
          status: recovered.outcome,
        },
        requestId: id,
      });
    }

    stage = "load_provider";
    const adapter = createTempoMerchantAdapter({
      config: mppConfigForSnapshot(prepared.offer),
      store: mppAtomicStore,
    });
    stage = "handle_provider";
    const result = await adapter.handle({
      capabilityDigest,
      now: new Date(),
      request,
      snapshot: prepared.offer,
    });

    if (result.status === 402) {
      stage = "attach_challenge";
      await attachMppChallenge(prepared.setupId, result.safe.challenge.challengeId);
      const headers = new Headers(result.protocolResponse.headers);
      headers.set("cache-control", "no-store");
      headers.set("referrer-policy", "no-referrer");
      return new Response(result.protocolResponse.body, {
        status: 402,
        statusText: result.protocolResponse.statusText,
        headers,
      });
    }

    stage = "record_provider_event";
    const providerEventId = `mpp_${await sha256Hex(result.evidence.providerPaymentRef)}`;
    const payloadDigest = await digestProviderEvidence([
      result.evidence.providerPaymentRef,
      result.evidence.receiptDigest,
      result.evidence.paidAt.toISOString(),
    ]);
    await recordProviderEvent({
      provider: "mpp_tempo",
      providerEventId,
      orderId: prepared.orderId,
      eventType: "tempo.payment.verified",
      payloadDigest,
    });

    let evidencePersisted = false;
    try {
      stage = "persist_evidence";
      await persistVerifiedPaymentEvidence({
        orderId: prepared.orderId,
        provider: "mpp_tempo",
        providerPaymentRef: result.evidence.providerPaymentRef,
        receiptDigest: result.evidence.receiptDigest,
        paidAmountMinor: prepared.offer.amountMinor,
        paidCurrency: prepared.offer.currency,
        paidAt: result.evidence.paidAt,
        providerEventId,
      });
      evidencePersisted = true;
      stage = "fulfill_order";
      const fulfilled = await fulfillRoutineProOrder({
        orderId: prepared.orderId,
        provider: "mpp_tempo",
        providerPaymentRef: result.evidence.providerPaymentRef,
        receiptDigest: result.evidence.receiptDigest,
        paidAmountMinor: prepared.offer.amountMinor,
        paidCurrency: prepared.offer.currency,
        paidAt: result.evidence.paidAt,
        providerEventId,
      });
      return result.withReceipt(
        protocolJson({
          ok: true,
          data: {
            orderRef: prepared.publicRef,
            status: fulfilled.outcome,
          },
          requestId: id,
        }),
      );
    } catch (error) {
      if (!evidencePersisted) throw error;
      stage = "mark_paid_unfulfilled";
      await markPaidUnfulfilled(prepared.orderId, providerEventId);
      return result.withReceipt(
        protocolJson(
          {
            ok: false,
            error: {
              code: "FULFILLMENT_PENDING",
              message: "Payment was verified and entitlement fulfillment is being retried.",
              retryable: true,
            },
            requestId: id,
          },
          202,
        ),
      );
    }
  } catch (error) {
    const safeError = asCommerceError(error);
    console.error(
      "routine_pro_mpp_failed",
      JSON.stringify({
        requestId: id,
        stage,
        cause: safeAgentPaymentFailureCause(error),
        clientCode: safeError.code,
      }),
    );
    return failure(safeError, id);
  }
}
