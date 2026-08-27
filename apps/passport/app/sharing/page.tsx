import type { Metadata } from "next";
import { SharingView } from "@/components/views/sharing-view";

export const metadata: Metadata = { title: "Sharing & permissions" };
export default function Page() {
  return <SharingView />;
}
