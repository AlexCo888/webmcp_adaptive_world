import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL("../migrations/0006_adaptive_routine_pro.sql", import.meta.url);
const canonicalGrantMigrationUrl = new URL(
  "../migrations/0007_canonical_access_grants.sql",
  import.meta.url,
);
const patientLockMigrationUrl = new URL(
  "../migrations/0008_patient_lock_order.sql",
  import.meta.url,
);
const functionalSourceCategoryMigrationUrl = new URL(
  "../migrations/0009_functional_source_category.sql",
  import.meta.url,
);
const redemptionAndGoalMigrationUrl = new URL(
  "../migrations/0010_redeem_alias_and_routine_goal.sql",
  import.meta.url,
);

describe("Adaptive Routine Pro migration safeguards", () => {
  it("binds each budget reservation to the immutable order amount", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toMatch(
      /UNIQUE\s*\(id, amount_minor\)[\s\S]*FOREIGN KEY\s*\(order_id, amount_minor\)\s*REFERENCES commerce_orders\(id, amount_minor\)/u,
    );
    expect(migration).toContain("agent_budget_reservations_immutable_authority");
    expect(migration).toContain("NEW.amount_minor IS DISTINCT FROM OLD.amount_minor");
  });

  it("checks the persisted provider snapshot bytes and digest", async () => {
    const migration = await readFile(migrationUrl, "utf8");

    expect(migration).toContain("request_params = request_params_canonical::jsonb");
    expect(migration).toContain("digest(request_params_canonical, 'sha256')");
  });

  it("blocks concurrent legacy grant writes while canonicalizing live authority", async () => {
    const migration = await readFile(canonicalGrantMigrationUrl, "utf8");

    expect(migration).toContain("LOCK TABLE access_grants IN SHARE ROW EXCLUSIVE MODE");
    expect(migration.indexOf("LOCK TABLE access_grants")).toBeLessThan(
      migration.indexOf("WITH ranked AS"),
    );
    expect(migration.indexOf("WITH ranked AS")).toBeLessThan(
      migration.indexOf("CREATE UNIQUE INDEX access_grants_one_live_authority_uidx"),
    );
  });

  it("excludes expired legacy grants from the canonical live authority", async () => {
    const migration = await readFile(canonicalGrantMigrationUrl, "utf8");
    const expiryCutover = migration.indexOf("UPDATE access_grants AS expired_grant");
    const firstRanking = migration.indexOf("WITH ranked AS");
    const uniqueIndex = migration.indexOf(
      "CREATE UNIQUE INDEX access_grants_one_live_authority_uidx",
    );

    expect(expiryCutover).toBeGreaterThan(-1);
    expect(expiryCutover).toBeLessThan(firstRanking);
    expect(firstRanking).toBeLessThan(uniqueIndex);
    expect(migration).toMatch(
      /UPDATE access_grants AS expired_grant[\s\S]*status = 'expired'[\s\S]*expired_grant\.expires_at <= now\(\)/u,
    );
    expect(migration.match(/grant_row\.expires_at > now\(\)/gu)).toHaveLength(2);
  });

  it("retains live expiry aggregation when a legacy grant has no scopes", async () => {
    const migration = await readFile(canonicalGrantMigrationUrl, "utf8");

    expect(migration).toContain(
      "LEFT JOIN LATERAL jsonb_array_elements_text(ranked.scopes) AS scope(scope_value) ON true",
    );
    expect(migration).toContain("FILTER (WHERE scope_value IS NOT NULL)");
    expect(migration).toContain("'[]'::jsonb");
  });

  it("locks the patient before claiming a context grant during redemption", async () => {
    const migration = await readFile(patientLockMigrationUrl, "utf8");
    const patientLock = migration.indexOf("FOR UPDATE OF patient_row");
    const grantClaim = migration.indexOf("UPDATE public.context_grants");

    expect(patientLock).toBeGreaterThan(-1);
    expect(grantClaim).toBeGreaterThan(patientLock);
    expect(migration).toContain("AND patient_id = target_patient_id");
  });

  it("qualifies the additive context-grant claim so PL/pgSQL outputs cannot shadow columns", async () => {
    const migration = await readFile(redemptionAndGoalMigrationUrl, "utf8");

    expect(migration).toContain("UPDATE public.context_grants AS grant_row");
    expect(migration).toContain("AND grant_row.patient_id = target_patient_id");
    expect(migration).toContain("RETURNING grant_row.* INTO claimed");
    expect(migration).not.toMatch(/\n\s+AND patient_id = target_patient_id/gu);
  });

  it("persists and freezes a bounded natural-language goal on payment orders", async () => {
    const migration = await readFile(redemptionAndGoalMigrationUrl, "utf8");

    expect(migration).toContain("ALTER TABLE commerce_orders ADD COLUMN initial_goal text");
    expect(migration).toContain("length(initial_goal) BETWEEN 2 AND 160");
    expect(migration).toContain("NEW.initial_goal IS DISTINCT FROM OLD.initial_goal");
    expect(migration).toContain("NEW.initial_template_id <> OLD.initial_template_id");
  });

  it("backfills only missing functional provenance on synthetic demo profiles", async () => {
    const migration = await readFile(functionalSourceCategoryMigrationUrl, "utf8");

    expect(migration).toContain("to_jsonb('self_reported'::text)");
    expect(migration).toContain("synthetic_demo = true");
    expect(migration).toContain("jsonb_typeof(profile->'functional') = 'object'");
    expect(migration).toContain("NOT (profile->'functional' ? 'sourceCategory')");
  });
});
