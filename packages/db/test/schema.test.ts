import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  accessGrants,
  auditEvents,
  clinicalGuidance,
  contextGrants,
  documents,
  equipment,
  gymSessions,
  labReports,
  labResults,
  patients,
  sessionFeedback,
  users,
} from "../src/schema";

describe("database schema", () => {
  it("exports every security boundary table", () => {
    expect(
      [
        users,
        patients,
        documents,
        labReports,
        labResults,
        accessGrants,
        contextGrants,
        auditEvents,
        clinicalGuidance,
        equipment,
        gymSessions,
        sessionFeedback,
      ].map(getTableName),
    ).toEqual([
      "users",
      "patients",
      "documents",
      "lab_reports",
      "lab_results",
      "access_grants",
      "context_grants",
      "audit_events",
      "clinical_guidance",
      "equipment",
      "gym_sessions",
      "session_feedback",
    ]);
  });
});
