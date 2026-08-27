import { DashboardView } from "@/components/views/dashboard-view";
import { requireActor } from "@/lib/session";

export default async function Page() {
  await requireActor("owner");
  return <DashboardView />;
}
