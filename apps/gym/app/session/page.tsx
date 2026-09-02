import type { Metadata } from "next";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { SessionPlanner } from "@/components/session-planner";

export const metadata: Metadata = {
  title: "Build a session",
  description:
    "Review an agent-generated routine grounded in the active Passport projection and Adaptive Gym's verified equipment.",
};

export default function SessionPage() {
  return (
    <div className="page-wrap">
      <header className="session-header">
        <p className="eyebrow">Understand → Generate → Confirm → Act</p>
        <h1 className="page-title">Bring your agent, or choose a staff walkthrough.</h1>
        <p className="page-intro">
          With an agent, the user-selected WebMCP agent generates a new routine from the approved
          Passport projection and verified Gym inventory. Without one, you can choose a published
          staff walkthrough. Either way Adaptive Gym shows the exact proposal, validates it,
          processes the sandbox payment, saves it to Passport, and exposes a recoverable receipt.
        </p>
      </header>
      <SessionPlanner equipment={equipmentCatalog} />
    </div>
  );
}
