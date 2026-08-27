import type { Metadata } from "next";
import { DoctorView } from "@/components/views/doctor-view";
import { requireActor } from "@/lib/session";

export const metadata: Metadata = { title: "Doctor portal" };
export default async function Page() {
  await requireActor("doctor");
  return <DoctorView />;
}
