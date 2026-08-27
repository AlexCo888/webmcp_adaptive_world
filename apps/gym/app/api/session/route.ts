import { GeneratedSessionSchema } from "@adaptive-world/contracts";
import { gymSessions } from "@adaptive-world/db/schema";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/database";
import { getGymSession, toPublicGymContext } from "@/lib/gym-session";
import { createGroundedSession, facilityTemplates } from "@/lib/session-planner";

const templateIds = facilityTemplates.map((item) => item.id) as [
  (typeof facilityTemplates)[number]["id"],
  ...(typeof facilityTemplates)[number]["id"][],
];
const RequestSchema = z.object({
  templateId: z.enum(templateIds),
  createdVia: z.enum(["site-ui", "webmcp"]).default("site-ui"),
});

export async function GET() {
  const active = await getGymSession();
  if (!active)
    return NextResponse.json({ error: "Connect Passport context first." }, { status: 401 });
  const plan = GeneratedSessionSchema.safeParse(active.row.plan);
  return NextResponse.json(
    { session: plan.success ? plan.data : null },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const active = await getGymSession();
  if (!active) {
    return NextResponse.json(
      { error: "Connect a one-use Passport context before choosing a walkthrough." },
      { status: 401 },
    );
  }
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Choose one published facility walkthrough." },
      { status: 400 },
    );
  }
  try {
    const session = GeneratedSessionSchema.parse(
      createGroundedSession({
        profile: toPublicGymContext(active.stored, active.row.id),
        equipment: equipmentCatalog,
        templateId: parsed.data.templateId,
        createdVia: parsed.data.createdVia,
        sessionId: active.row.id,
      }),
    );
    const updated = await db
      .update(gymSessions)
      .set({ plan: session, status: "draft" })
      .where(
        and(
          eq(gymSessions.id, active.row.id),
          eq(gymSessions.anonymousSubjectId, active.subjectId),
        ),
      )
      .returning({ id: gymSessions.id });
    if (updated.length !== 1) throw new Error("The active Gym session was not found.");
    return NextResponse.json(
      { session },
      { status: 201, headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "The walkthrough could not be matched." },
      { status: 422 },
    );
  }
}
