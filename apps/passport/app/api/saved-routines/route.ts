import { apiSuccess, requestId, requireApiActor } from "@/lib/api";
import { listSavedRoutines } from "@/lib/saved-routines";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, "owner", currentRequestId);
  if (authorization.response) return authorization.response;
  return apiSuccess({ routines: await listSavedRoutines(authorization.actor) }, currentRequestId);
}
