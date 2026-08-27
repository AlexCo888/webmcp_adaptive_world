import type { Metadata } from "next";
import { SharingView } from "@/components/views/sharing-view";
import { requireActor } from "@/lib/session";

export const metadata: Metadata = { title: "Sharing & permissions" };
export default async function Page() {
  await requireActor("owner");
  return <SharingView />;
}
