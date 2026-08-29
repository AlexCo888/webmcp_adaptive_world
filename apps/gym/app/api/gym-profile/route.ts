import { gymProfile } from "@/lib/gym-profile";

export function GET(request: Request) {
  return Response.json(
    {
      ok: true,
      data: gymProfile,
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
    { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );
}
