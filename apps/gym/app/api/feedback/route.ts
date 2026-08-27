import { SessionFeedbackSchema } from "@adaptive-world/contracts";

export async function POST(request: Request) {
  const parsed = SessionFeedbackSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      {
        error: "Feedback could not be validated.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400 },
    );
  return Response.json(
    {
      accepted: true,
      feedback: parsed.data,
      nextAdaptation:
        parsed.data.painDuringSession >= 4
          ? "Reduce loading and review movement selection before the next session."
          : parsed.data.perceivedEffort >= 8
            ? "Keep the same movements and reduce intensity or volume slightly."
            : "Maintain the pattern and progress one variable gradually.",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
