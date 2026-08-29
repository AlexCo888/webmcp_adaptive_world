import { z } from "zod";
import { apiError, apiSuccess, requestId, requireApiActor } from "@/lib/api";
import { getSavedRoutineDetail } from "@/lib/saved-routines";

export const runtime = "nodejs";

const IdSchema = z.string().uuid();

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const currentRequestId = requestId(request);
  const authorization = await requireApiActor(request, "owner", currentRequestId);
  if (authorization.response) return authorization.response;
  const parsedId = IdSchema.safeParse((await context.params).id);
  if (!parsedId.success) {
    return apiError("NOT_FOUND", "Saved routine not found.", 404, currentRequestId);
  }
  const routine = await getSavedRoutineDetail(authorization.actor, parsedId.data);
  if (!routine) return apiError("NOT_FOUND", "Saved routine not found.", 404, currentRequestId);
  return apiSuccess({ routine }, currentRequestId);
}
