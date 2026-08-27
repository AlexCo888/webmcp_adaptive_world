import type { Metadata } from "next";
import { DocumentsView } from "@/components/views/documents-view";
import { requireActor } from "@/lib/session";

export const metadata: Metadata = { title: "Documents & labs" };
export default async function Page() {
  await requireActor("owner");
  return <DocumentsView />;
}
