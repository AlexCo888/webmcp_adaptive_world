import type { Metadata } from "next";
import { ToolsView } from "@/components/views/tools-view";

export const metadata: Metadata = { title: "WebMCP tool registry" };
export default function Page() {
  return <ToolsView />;
}
