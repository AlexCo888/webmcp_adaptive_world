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
        <h1 className="page-title">Your selected agent supplies the intelligence.</h1>
        <p className="page-intro">
          The user-selected WebMCP agent generates a new routine from the approved Passport
          projection and verified Gym inventory. Adaptive Gym validates the exact proposal,
          processes the sandbox payment, saves it to Passport, and exposes a recoverable receipt.
        </p>
      </header>
      <SessionPlanner equipment={equipmentCatalog} />
    </div>
  );
}
