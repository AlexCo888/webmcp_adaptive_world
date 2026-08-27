import { GeneratedSessionSchema, GymContextProjectionSchema } from "@adaptive-world/contracts";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { createGroundedSession } from "@/lib/session-planner";
import { z } from "zod";

const RequestSchema = z.object({
  profile: GymContextProjectionSchema,
  goal: z.string().trim().min(3).max(160),
  durationMinutes: z.number().int().min(15).max(120),
  equipmentIds: z.array(z.string()).max(8).default([]),
});

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: "The session request is incomplete or invalid." },
      { status: 400 },
    );
  try {
    const session = GeneratedSessionSchema.parse(
      createGroundedSession({ ...parsed.data, equipment: equipmentCatalog }),
    );
    return Response.json({ session }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "A grounded session could not be created.",
      },
      { status: 422 },
    );
  }
}
