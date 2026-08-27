import type { Metadata } from "next";
import { ToolsView } from "@/components/views/tools-view";
import { requireActor } from "@/lib/session";

export const metadata: Metadata = { title: "WebMCP tool registry" };
export default async function Page() {
  await requireActor();
  return <ToolsView />;
}
