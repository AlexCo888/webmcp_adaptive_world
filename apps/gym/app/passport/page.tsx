import type { Metadata } from "next";
import { demoGymProfiles } from "@adaptive-world/demo-data";
import { ContextPassport } from "@/components/context-passport";

export const metadata: Metadata = {
  title: "Passport context",
  description: "Review and connect a minimum, consented Digital Passport projection.",
};

export default function PassportPage() {
  return (
    <div className="page-wrap">
      <header className="context-header">
        <p className="eyebrow">Progressive disclosure</p>
        <h1 className="page-title">Bring only what helps.</h1>
        <p className="page-intro">
          The Gym receives a purpose-built projection—not a medical record. Inspect every field
          before connecting it.
        </p>
      </header>
      <ContextPassport profiles={demoGymProfiles} />
    </div>
  );
}
