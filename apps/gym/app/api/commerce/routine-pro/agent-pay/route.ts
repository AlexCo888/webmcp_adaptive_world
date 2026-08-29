import { ConfirmRoutineRequestSchema } from "@adaptive-world/contracts";
import { digestRoutineProCapability } from "@adaptive-world/security";
import { getGymSession } from "@/lib/gym-session";
import { retryPaidUnfulfilledOrder } from "@/lib/commerce/fulfillment";
import {
  markAgentPaymentReconciliationRequired,
  markAgentPaymentSubmitted,
  reserveAgentBudgetForOrder,
} from "@/lib/commerce/budget";
import { getCommerceConfig } from "@/lib/commerce/config";
import {
  assertSameOrigin,
  CommerceError,
  failure,
  parseBoundedJson,
  requestId,
  success,
} from "@/lib/commerce/http";
import { prepareMppOrder } from "@/lib/commerce/mpp-order";
import { createTempoAgentPaymentAdapter, MppAdapterError } from "@/lib/commerce/mpp";
import { mppConfigForSnapshot } from "@/lib/commerce/mpp-runtime";
import {
  createOrReuseRoutineProOrder,
  getPayableOrder,
  hasRoutineProEntitlement,
} from "@/lib/commerce/orders";
import { verifyRoutineProQuote } from "@/lib/commerce/quote";
import { rateLimitPaymentOrder, rateLimitPaymentRequest } from "@/lib/commerce/rate-limit";
import { createAndSavePersonalizedRoutine } from "@/lib/commerce/routines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    assertSameOrigin(request);
    const config = getCommerceConfig();
    const parsed = ConfirmRoutineRequestSchema.safeParse(await parseBoundedJson(request));
    if (!parsed.success || parsed.data.paymentMode !== "agent_wallet") {
      throw new CommerceError("INVALID_REQUEST");
    }
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const entitled = await hasRoutineProEntitlement(active.row.patientId);
    const recoverable = entitled ? null : await getPayableOrder(active.row.patientId);
    if (recoverable?.provider === "mpp_tempo" && recoverable.status === "paid_unfulfilled") {
      await rateLimitPaymentRequest(request, {
        sessionId: active.row.id,
        orderRef: recoverable.publicRef,
        agent: true,
      });
      await retryPaidUnfulfilledOrder(recoverable.id);
      if (!(await hasRoutineProEntitlement(active.row.patientId))) {
        throw new CommerceError("FULFILLMENT_PENDING", true);
      }
      const routine = await createAndSavePersonalizedRoutine({
        active,
        templateId: parsed.data.templateId,
        initiatedVia: parsed.data.initiatedVia,
      });
      return success(
        {
          entitled: true,
          orderRef: recoverable.publicRef,
          payerLabel: "Adaptive World demo agent" as const,
          ...routine,
        },
        id,
        routine.reused ? 200 : 201,
      );
    }
    if (!config.agentEnabled) throw new CommerceError("PROVIDER_UNAVAILABLE");
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
    await rateLimitPaymentRequest(request, { sessionId: active.row.id, agent: true });

    const state = await createOrReuseRoutineProOrder({
      active,
      templateId: parsed.data.templateId,
      paymentMode: "agent_wallet",
      initiatedVia: parsed.data.initiatedVia,
    });
    if (state.entitled) {
      const routine = await createAndSavePersonalizedRoutine({
        active,
        templateId: parsed.data.templateId,
        initiatedVia: parsed.data.initiatedVia,
      });
      return success({ entitled: true, ...routine }, id, routine.reused ? 200 : 201);
    }
    const order = state.order;
    if (!order) throw new CommerceError("INTERNAL_ERROR", true);
    await rateLimitPaymentOrder(order.publicRef);
    if (order.status === "paid_unfulfilled") {
      await retryPaidUnfulfilledOrder(order.id);
      if (!(await hasRoutineProEntitlement(active.row.patientId))) {
        throw new CommerceError("FULFILLMENT_PENDING", true);
      }
      const routine = await createAndSavePersonalizedRoutine({
        active,
        templateId: parsed.data.templateId,
        initiatedVia: parsed.data.initiatedVia,
      });
      return success(
        {
          entitled: true,
          orderRef: order.publicRef,
          payerLabel: "Adaptive World demo agent" as const,
          ...routine,
        },
        id,
        routine.reused ? 200 : 201,
      );
    }
    if (["payment_submitted", "reconciliation_required"].includes(order.status)) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    await reserveAgentBudgetForOrder(order);
    const prepared = await prepareMppOrder(order);
    const capabilityDigest = await digestRoutineProCapability(prepared.capability);
    const adapter = createTempoAgentPaymentAdapter({
      config: mppConfigForSnapshot(prepared.offer),
    });
    const payment = await adapter.prepare({
      capability: prepared.capability,
      capabilityDigest,
      now: new Date(),
      signal: request.signal,
      snapshot: prepared.offer,
    });
    const signed = await payment.sign();
    const paid = await signed.submitAfterMarkSubmitted({
      markSubmitted: async () => {
        await markAgentPaymentSubmitted(order.id);
      },
    });
    if (paid.outcome === "reconciliation_required") {
      await markAgentPaymentReconciliationRequired(order.id);
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    if (!(await hasRoutineProEntitlement(active.row.patientId))) {
      throw new CommerceError("FULFILLMENT_PENDING", true);
    }
    const routine = await createAndSavePersonalizedRoutine({
      active,
      templateId: parsed.data.templateId,
      initiatedVia: parsed.data.initiatedVia,
    });
    return success(
      {
        entitled: true,
        orderRef: order.publicRef,
        payerLabel: "Adaptive World demo agent" as const,
        ...routine,
      },
      id,
      routine.reused ? 200 : 201,
    );
  } catch (error) {
    return failure(asCommerceError(error), id);
  }
}
