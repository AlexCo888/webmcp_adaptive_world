import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { buildCanonicalDemoGrantSeedStatement } from "../scripts/canonical-demo-grant";

function renderSeedStatement(): string {
  const statement = buildCanonicalDemoGrantSeedStatement({
    grantId: "30000000-0000-4000-8000-000000000001",
    patientId: "10000000-0000-4000-8000-000000000001",
    granteeUserId: "00000000-0000-4000-8000-000000000002",
    relationshipId: "20000000-0000-4000-8000-000000000001",
    createdByUserId: "00000000-0000-4000-8000-000000000001",
    purpose: "Synthetic continuity-of-care demonstration",
    scopes: ["passport.summary.read", "passport.clinical.read"],
    expiresAt: new Date("2027-02-25T00:00:00.000Z"),
  });
  return new PgDialect().sqlToQuery(statement).sql.replace(/\s+/gu, " ").trim();
}

describe("canonical demo grant seeding", () => {
  it("serializes on the patient and revokes a replacement before reactivating the seed id", () => {
    const rendered = renderSeedStatement();
    const patientLock = rendered.indexOf("FOR UPDATE OF patient_row");
    const revokeReplacement = rendered.indexOf("UPDATE access_grants AS grant_row");
    const revocationBarrier = rendered.indexOf("CROSS JOIN revocation_barrier");
    const canonicalWrite = rendered.indexOf("INSERT INTO access_grants");

    expect(patientLock).toBeGreaterThan(-1);
    expect(revokeReplacement).toBeGreaterThan(patientLock);
    expect(canonicalWrite).toBeGreaterThan(revokeReplacement);
    expect(revocationBarrier).toBeGreaterThan(canonicalWrite);
    expect(rendered).toContain("grant_row.id <> $4::uuid");
    expect(rendered).toContain("ON CONFLICT (id) DO UPDATE SET");
  });
});
