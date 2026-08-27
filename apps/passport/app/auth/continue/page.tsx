import { redirect } from "next/navigation";
import { requireActor } from "@/lib/session";

export default async function AuthContinuePage() {
  const actor = await requireActor();
  redirect(actor.role === "doctor" ? "/doctor" : "/");
}
