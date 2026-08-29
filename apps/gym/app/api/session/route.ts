import { GeneratedSessionSchema } from "@adaptive-world/contracts";
import { NextResponse } from "next/server";
import { getGymSession } from "@/lib/gym-session";

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
