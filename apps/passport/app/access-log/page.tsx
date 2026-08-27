import type { Metadata } from "next";
import { AccessLogView } from "@/components/views/access-log-view";
import { requireActor } from "@/lib/session";

export const metadata: Metadata = { title: "Access log" };
export default async function Page() {
  await requireActor("owner");
  return <AccessLogView />;
}
