import type { Metadata } from "next";
import { DoctorView } from "@/components/views/doctor-view";

export const metadata: Metadata = { title: "Doctor portal" };
export default function Page() {
  return <DoctorView />;
}
