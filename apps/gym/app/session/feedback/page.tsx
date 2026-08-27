import type { Metadata } from "next";
import { SessionFeedback } from "@/components/session-feedback";

export const metadata: Metadata = {
  title: "Session feedback",
  description: "Record feedback from a grounded Adaptive Gym session.",
};

export default function SessionFeedbackPage() {
  return (
    <div className="page-wrap">
      <SessionFeedback />
    </div>
  );
}
