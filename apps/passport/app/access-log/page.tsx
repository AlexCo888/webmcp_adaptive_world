import type { Metadata } from "next";
import { AccessLogView } from "@/components/views/access-log-view";

export const metadata: Metadata = { title: "Access log" };
export default function Page() {
  return <AccessLogView />;
}
