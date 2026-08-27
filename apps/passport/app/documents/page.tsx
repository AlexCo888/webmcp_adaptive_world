import type { Metadata } from "next";
import { DocumentsView } from "@/components/views/documents-view";

export const metadata: Metadata = { title: "Documents & labs" };
export default function Page() {
  return <DocumentsView />;
}
