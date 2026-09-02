import { ConfirmRoutineRequestSchema } from "@adaptive-world/contracts";
import { digestRoutineProCapability } from "@adaptive-world/security";
import { getGymSession } from "@/lib/gym-session";
import {
  isAgentPaymentConfigurationError,
  safeAgentPaymentFailureCause,
} from "@/lib/commerce/agent-pay-diagnostics";
import {
  markAgentPaymentReconciliationRequired,
  markAgentPaymentSubmitted,
  releaseAgentReservationBeforeSubmission,
  reserveAgentBudgetForOrder,
} from "@/lib/commerce/budget";
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
import { createTempoAgentPaymentAdapter, MppAdapterError } from "@/lib/commerce/mpp";
import { prepareMppOrder } from "@/lib/commerce/mpp-order";
import { mppConfigForSnapshot } from "@/lib/commerce/mpp-runtime";
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
  validatePersonalizedRoutineRequest,
} from "@/lib/commerce/routines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asCommerceError(error: unknown): CommerceError {
  if (!(error instanceof MppAdapterError)) {
    if (isAgentPaymentConfigurationError(error)) {
      return new CommerceError("PROVIDER_UNAVAILABLE", true);
    }
    return error instanceof CommerceError ? error : new CommerceError("INTERNAL_ERROR", true);
  }
  const code =
    error.safeCode === "INVALID_PAYMENT_SNAPSHOT" ? "RECONCILIATION_REQUIRED" : error.safeCode;
  return new CommerceError(code, error.retryable);
}

export async function POST(request: Request) {
  const id = requestId(request);
  let stage = "validate_request";
  let cleanupOrderId: string | null = null;
  let submissionClaimed = false;
  try {
    assertSameOrigin(request);
    const config = getCommerceConfig();
    const parsed = ConfirmRoutineRequestSchema.safeParse(await parseBoundedJson(request));
    if (
      !parsed.success ||
      parsed.data.paymentMode !== "agent_wallet" ||
      parsed.data.initiatedVia !== "webmcp"
    ) {
      throw new CommerceError("INVALID_REQUEST");
    }
    stage = "load_context";
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const validated = validatePersonalizedRoutineRequest({
      active,
      goal: parsed.data.goal,
      routine: parsed.data.routine,
    });
    const entitled = await hasRoutineProEntitlement(active.row.patientId);
    const recoverable = entitled ? null : await getPayableOrder(active.row.patientId);
    const recoveringPaidOrder =
      recoverable?.provider === "mpp_tempo" && recoverable.status === "paid_unfulfilled";

    if (!recoveringPaidOrder) {
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
    }

    stage = "rate_limit_request";
    await rateLimitPaymentRequest(request, {
      sessionId: active.row.id,
      ...(recoverable ? { orderRef: recoverable.publicRef } : {}),
      agent: true,
    });

    stage = "create_order";
    const state = await createOrReuseRoutineProOrder({
      active,
      session: validated.session,
      routine: validated.routine,
      goal: parsed.data.goal,
      paymentMode: "agent_wallet",
    });
    if (state.entitled) {
      await createAndSavePersonalizedRoutine({
        active,
        goal: parsed.data.goal,
        routine: parsed.data.routine,
      });
      return success(await getRoutineProStatusForActiveSession(active), id, 200);
    }
    const order = state.order;
    if (!order) throw new CommerceError("INTERNAL_ERROR", true);
    await rateLimitPaymentOrder(order.publicRef);

    if (order.status === "paid_unfulfilled") {
      stage = "recover_fulfillment";
      await retryPaidUnfulfilledOrder(order.id);
      if (!(await hasRoutineProEntitlement(active.row.patientId))) {
        throw new CommerceError("FULFILLMENT_PENDING", true);
      }
      await createAndSavePersonalizedRoutine({
        active,
        goal: parsed.data.goal,
        routine: parsed.data.routine,
      });
      return success(await getRoutineProStatusForActiveSession(active, order.publicRef), id, 200);
    }
    if (["payment_submitted", "reconciliation_required"].includes(order.status)) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }

    cleanupOrderId = order.id;
    stage = "reserve_budget";
    await reserveAgentBudgetForOrder(order);
    stage = "prepare_snapshot";
    const prepared = await prepareMppOrder(order);
    stage = "load_provider";
    const capabilityDigest = await digestRoutineProCapability(prepared.capability);
    const adapter = createTempoAgentPaymentAdapter({
      config: mppConfigForSnapshot(prepared.offer),
    });
    stage = "prepare_provider";
    const payment = await adapter.prepare({
      capability: prepared.capability,
      capabilityDigest,
      now: new Date(),
      signal: request.signal,
      snapshot: prepared.offer,
    });
    stage = "sign_payment";
    const signed = await payment.sign();
    stage = "submit_payment";
    const paid = await signed.submitAfterMarkSubmitted({
      markSubmitted: async () => {
        stage = "mark_submitted";
        await markAgentPaymentSubmitted(order.id);
        submissionClaimed = true;
        stage = "submit_payment";
      },
    });
    if (paid.outcome === "reconciliation_required") {
      await markAgentPaymentReconciliationRequired(order.id);
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    stage = "verify_entitlement";
    if (!(await hasRoutineProEntitlement(active.row.patientId))) {
      throw new CommerceError("FULFILLMENT_PENDING", true);
    }
    await createAndSavePersonalizedRoutine({
      active,
      goal: parsed.data.goal,
      routine: parsed.data.routine,
    });
    return success(await getRoutineProStatusForActiveSession(active, order.publicRef), id, 201);
  } catch (error) {
    let safeError = asCommerceError(error);
    if (cleanupOrderId && !submissionClaimed) {
      try {
        await releaseAgentReservationBeforeSubmission(cleanupOrderId, `agent_pay_${stage}_failed`);
      } catch (cleanupError) {
        console.error(
          "routine_pro_agent_pay_cleanup_failed",
          JSON.stringify({
            requestId: id,
            stage,
            cause: safeAgentPaymentFailureCause(cleanupError),
          }),
        );
        safeError = new CommerceError("RECONCILIATION_REQUIRED");
      }
    }
    console.error(
      "routine_pro_agent_pay_failed",
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
