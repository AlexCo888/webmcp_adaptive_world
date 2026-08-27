import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/sign-in-form";
import { getOptionalActor } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  const actor = await getOptionalActor();
  if (actor) redirect(actor.role === "doctor" ? "/doctor" : "/");
  return <SignInForm />;
}
