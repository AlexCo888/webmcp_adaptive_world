import { demoGymProfiles } from "@adaptive-world/demo-data";
import { z } from "zod";

const RequestSchema = z.object({ code: z.string().trim().min(3).max(96) });

const demoGrantState = globalThis as typeof globalThis & {
  adaptiveWorldRedeemedDemoCodes?: Set<string>;
};
const redeemedCodes =
  demoGrantState.adaptiveWorldRedeemedDemoCodes ??
  (demoGrantState.adaptiveWorldRedeemedDemoCodes = new Set<string>());

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Enter a valid context grant code." }, { status: 400 });
  const normalized = parsed.data.code.toLowerCase().replaceAll("_", "-");
  if (redeemedCodes.has(normalized)) {
    return Response.json(
      { error: "This one-time context grant has already been redeemed." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }
  const alias = normalized.startsWith("demo-") ? normalized.slice(5) : normalized;
  const demoAliases = ["mateo", "daniel", "maya", "evelyn", "michael", "amina"];
  const aliasIndex = demoAliases.indexOf(alias);
  const projection =
    aliasIndex >= 0
      ? demoGymProfiles[aliasIndex]
      : demoGymProfiles.find((profile) => profile.projectionId.toLowerCase() === normalized);
  if (!projection)
    return Response.json(
      { error: "This context grant is invalid, expired or already redeemed." },
      { status: 404 },
    );
  redeemedCodes.add(normalized);
  return Response.json(
    { projection, redeemed: true, demo: true },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}
