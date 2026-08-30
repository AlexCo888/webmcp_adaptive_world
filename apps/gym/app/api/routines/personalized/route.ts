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
import { hasRoutineProEntitlement } from "@/lib/commerce/orders";
import { verifyRoutineProQuote } from "@/lib/commerce/quote";
import { createAndSavePersonalizedRoutine } from "@/lib/commerce/routines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    assertSameOrigin(request);
    const parsed = ConfirmRoutineRequestSchema.safeParse(await parseBoundedJson(request));
    if (!parsed.success) throw new CommerceError("INVALID_REQUEST");
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const entitled = await hasRoutineProEntitlement(active.row.patientId);
    if (!entitled) throw new CommerceError("PAYMENT_REQUIRED");
    const config = getCommerceConfig();
    const supportedModes = [
      ...(config.stripeEnabled ? (["human_checkout"] as const) : []),
      ...(config.agentEnabled ? (["agent_wallet"] as const) : []),
    ];
    if (
      !verifyRoutineProQuote({
        sessionId: active.row.id,
        entitled: true,
        supportedModes: [...supportedModes],
        quoteValidUntil: parsed.data.quoteValidUntil,
        quoteDigest: parsed.data.quoteDigest,
      })
    ) {
      throw new CommerceError("QUOTE_CHANGED");
    }
    const routine = await createAndSavePersonalizedRoutine({
      active,
      templateId: parsed.data.templateId,
      goal: parsed.data.goal,
      initiatedVia: parsed.data.initiatedVia,
    });
    return success({ entitled: true, ...routine }, id, routine.reused ? 200 : 201);
  } catch (error) {
    return failure(error, id);
  }
}
