import type { Metadata } from "next";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { SessionPlanner } from "@/components/session-planner";

export const metadata: Metadata = {
  title: "Build a session",
  description: "Build a reviewable session grounded in Adaptive Gym's real equipment catalog.",
};

export default function SessionPage() {
  return (
    <div className="page-wrap">
      <header className="session-header">
        <p className="eyebrow">Match → Act</p>
        <h1 className="page-title">Build with what’s actually here.</h1>
        <p className="page-intro">
          Choose a versioned walkthrough written by Gym staff. The server reads your minimum
          context, verifies every station against current inventory, and records the invocation
          path.
        </p>
      </header>
      <SessionPlanner equipment={equipmentCatalog} />
    </div>
  );
}
