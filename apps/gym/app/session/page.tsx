import type { Metadata } from "next";
import { demoGymProfiles, equipmentCatalog } from "@adaptive-world/demo-data";
import { SessionPlanner } from "@/components/session-planner";

export const metadata: Metadata = {
  title: "Build a session",
  description: "Build a reviewable session grounded in Adaptive Gym's real equipment catalog.",
};

type Props = { searchParams: Promise<{ equipment?: string }> };

export default async function SessionPage({ searchParams }: Props) {
  const { equipment } = await searchParams;
  const initialEquipmentId = equipmentCatalog.some((item) => item.id === equipment)
    ? equipment
    : undefined;
  return (
    <div className="page-wrap">
      <header className="session-header">
        <p className="eyebrow">Match → Act</p>
        <h1 className="page-title">Build with what’s actually here.</h1>
        <p className="page-intro">
          Your minimum context guides the match. Availability and recorded equipment capabilities
          keep it grounded.
        </p>
      </header>
      <SessionPlanner
        profiles={demoGymProfiles}
        equipment={equipmentCatalog}
        {...(initialEquipmentId ? { initialEquipmentId } : {})}
      />
    </div>
  );
}
