import { NextResponse } from "next/server";
import { getGymSession, GYM_SESSION_COOKIE, toPublicGymContext } from "@/lib/gym-session";

export async function GET() {
  const session = await getGymSession();
  if (!session) {
    return NextResponse.json(
      { active: false },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      active: true,
      projection: toPublicGymContext(session.stored, session.row.id),
      session: { id: session.row.id, status: session.row.status },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export function DELETE() {
  const response = NextResponse.json({ disconnected: true });
  response.cookies.set(GYM_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
  response.headers.set("cache-control", "no-store");
  return response;
}
