import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  accessGrants,
  agentBudgetReservations,
  auditEvents,
  clinicalGuidance,
  commerceOrders,
  contextGrants,
  documents,
  equipment,
  gymSessions,
  labReports,
  labResults,
  mppReplayStore,
  paymentProviderSetups,
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

  it("keeps the Drizzle commerce schema aligned with migration foreign keys", () => {
    const orderForeignKeys = getTableConfig(commerceOrders).foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();
      return {
        columns: reference.columns.map((column) => column.name),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
        foreignTable: getTableName(reference.foreignTable),
      };
    });
    expect(orderForeignKeys).toEqual(
      expect.arrayContaining([
        {
          columns: ["active_provider_setup_id"],
          foreignColumns: ["id"],
          foreignTable: "payment_provider_setups",
        },
        {
          columns: ["budget_reservation_id"],
          foreignColumns: ["id"],
          foreignTable: "agent_budget_reservations",
        },
        {
          columns: ["duplicate_of_order_id"],
          foreignColumns: ["id"],
          foreignTable: "commerce_orders",
        },
      ]),
    );

    const reservationConfig = getTableConfig(agentBudgetReservations);
    expect(reservationConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
      "agent_budget_reservations_order_amount_fk",
    );
    expect(getTableConfig(mppReplayStore).indexes.map((index) => index.config.name)).toContain(
      "mpp_replay_store_expiry_idx",
    );
  });

  it("represents the migration's authority checks in Drizzle", () => {
    const orderChecks = getTableConfig(commerceOrders).checks.map((entry) => entry.name);
    expect(orderChecks).toEqual(
      expect.arrayContaining([
        "commerce_orders_initiated_via_check",
        "commerce_orders_receipt_digest_check",
        "commerce_orders_capability_version_check",
        "commerce_orders_capability_digest_check",
      ]),
    );

    const setupChecks = getTableConfig(paymentProviderSetups).checks.map((entry) => entry.name);
    expect(setupChecks).toEqual(
      expect.arrayContaining([
        "payment_provider_setups_snapshot_json_check",
        "payment_provider_setups_snapshot_digest_check",
        "payment_provider_setups_lease_owner_hash_check",
        "payment_provider_setups_attached_check",
      ]),
    );
  });
});
