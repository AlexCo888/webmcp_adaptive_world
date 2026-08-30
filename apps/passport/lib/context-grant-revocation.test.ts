import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { revokeOwnerGymContextGrant } from "./context-grant-revocation";

describe("owner Gym handoff revocation", () => {
  it("locks the patient before revoking, cancelling the session, and auditing", async () => {
    let rendered = "";
    const execute = <T extends Record<string, unknown>>(query: SQL): Promise<{ rows: T[] }> => {
      rendered = new PgDialect().sqlToQuery(query).sql.replace(/\s+/gu, " ").trim();
      return Promise.resolve({
        rows: [
          {
            grant_id: "50000000-0000-4000-8000-000000000001",
            session_cancelled: true,
          },
        ] as unknown as T[],
      });
    };
    const revoked = await revokeOwnerGymContextGrant(
      {
        ownerUserId: "00000000-0000-4000-8000-000000000001",
        grantId: "50000000-0000-4000-8000-000000000001",
        requestId: "request-context-revoke",
      },
      execute,
    );

    expect(revoked).toEqual({
      grantId: "50000000-0000-4000-8000-000000000001",
      sessionCancelled: true,
    });
    const patientLock = rendered.indexOf("FOR UPDATE OF patient_row");
    const grantRevocation = rendered.indexOf("UPDATE context_grants AS grant_row");
    const sessionCancellation = rendered.indexOf("UPDATE gym_sessions AS session_row");
    const audit = rendered.indexOf("INSERT INTO audit_events");
    expect(patientLock).toBeGreaterThan(-1);
    expect(grantRevocation).toBeGreaterThan(patientLock);
    expect(sessionCancellation).toBeGreaterThan(grantRevocation);
    expect(audit).toBeGreaterThan(sessionCancellation);
    expect(rendered).toContain("grant_row.created_by_user_id =");
    expect(rendered).toContain("EXISTS (SELECT 1 FROM cancelled_session) AS session_cancelled");
  });
});
