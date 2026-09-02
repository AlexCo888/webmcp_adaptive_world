import { getGymSession } from "@/lib/gym-session";
import { CommerceError, failure, requestId, success } from "@/lib/commerce/http";
import { getRoutineProStatusForActiveSession } from "@/lib/commerce/routine-pro-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const active = await getGymSession();
    if (!active?.row.patientId) throw new CommerceError("CONTEXT_REQUIRED");
    const suppliedRef = new URL(request.url).searchParams.get("order") ?? undefined;
    const status = await getRoutineProStatusForActiveSession(active, suppliedRef);
    return success(status, id);
  } catch (error) {
    return failure(error, id);
  }
}
