import { GeneratedSessionSchema, SessionFeedbackSchema } from "@adaptive-world/contracts";
import { gymSessions, sessionFeedback } from "@adaptive-world/db/schema";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/database";
import { getGymSession } from "@/lib/gym-session";

export async function POST(request: Request) {
  const active = await getGymSession();
  if (!active) return NextResponse.json({ error: "The Gym session has expired." }, { status: 401 });
  const parsed = SessionFeedbackSchema.safeParse(await request.json().catch(() => null));
  const plan = GeneratedSessionSchema.safeParse(active.row.plan);
  if (!parsed.success || !plan.success || parsed.data.sessionId !== active.row.id) {
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

  await db
    .insert(sessionFeedback)
    .values({
      sessionId: active.row.id,
      anonymousSubjectId: active.subjectId,
      perceivedExertion: parsed.data.perceivedEffort,
      painAfter: parsed.data.painDuringSession,
      completed: parsed.data.completedExerciseIds.length === plan.data.exercises.length,
      notes: parsed.data.notes,
      exerciseFeedback: parsed.data.completedExerciseIds.map((equipmentId) => ({
        equipmentId,
        completed: true,
      })),
    })
    .onConflictDoUpdate({
      target: [sessionFeedback.sessionId, sessionFeedback.anonymousSubjectId],
      set: {
        perceivedExertion: parsed.data.perceivedEffort,
        painAfter: parsed.data.painDuringSession,
        completed: parsed.data.completedExerciseIds.length === plan.data.exercises.length,
        notes: parsed.data.notes,
        exerciseFeedback: parsed.data.completedExerciseIds.map((equipmentId) => ({
          equipmentId,
          completed: true,
        })),
      },
    });
  await db
    .update(gymSessions)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(eq(gymSessions.id, active.row.id), eq(gymSessions.anonymousSubjectId, active.subjectId)),
    );

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
