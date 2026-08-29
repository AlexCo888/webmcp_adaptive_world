import { GeneratedSessionSchema, SessionFeedbackSchema } from "@adaptive-world/contracts";
import { NextResponse } from "next/server";
import { commitSessionFeedbackIfLive } from "@/lib/feedback-write";
import { getGymSession } from "@/lib/gym-session";
import { GYM_CONTEXT_READ_SCOPE, GYM_FEEDBACK_WRITE_SCOPE } from "@/lib/gym-scopes";

export async function POST(request: Request) {
  // Consume and validate untrusted input before taking an authority snapshot. The
  // final write below still rechecks that authority atomically.
  const parsed = SessionFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Feedback does not match the active walkthrough." },
      { status: 400 },
    );
  }
  const active = await getGymSession([GYM_CONTEXT_READ_SCOPE, GYM_FEEDBACK_WRITE_SCOPE]);
  if (!active) return NextResponse.json({ error: "The Gym session has expired." }, { status: 401 });
  const plan = GeneratedSessionSchema.safeParse(active.row.plan);
  if (!plan.success || parsed.data.sessionId !== plan.data.id) {
    return NextResponse.json(
      { error: "Feedback does not match the active walkthrough." },
      { status: 400 },
    );
  }
  const validEquipment = new Set(plan.data.exercises.map((item) => item.equipmentId));
  if (!parsed.data.completedExerciseIds.every((id) => validEquipment.has(id))) {
    return NextResponse.json(
      { error: "Feedback contains a station outside this walkthrough." },
      { status: 400 },
    );
  }

  const committed = await commitSessionFeedbackIfLive({
    grantId: active.grant.id,
    internalSessionId: active.row.id,
    anonymousSubjectId: active.subjectId,
    plan: plan.data,
    feedback: parsed.data,
  });
  if (!committed) {
    return NextResponse.json(
      { error: "The Gym session has expired." },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const nextAdaptation =
    parsed.data.painDuringSession >= 4
      ? "A staff-review flag was added before another walkthrough is selected."
      : parsed.data.perceivedEffort >= 8
        ? "The next visit should begin with a staff check-in before repeating this template."
        : "Your observations are attached to this walkthrough for the next visit.";
  return NextResponse.json(
    { accepted: true, nextAdaptation },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
