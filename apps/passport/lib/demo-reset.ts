import {
  accessGrants,
  agentBudgetBuckets,
  agentBudgetReservations,
  auditEvents,
  clinicalGuidance,
  commerceOrders,
  contextGrants,
  doctorPatientRelationships,
  entitlementGrants,
  gymSessions,
  patients,
  paymentProviderSetups,
  savedRoutines,
  users,
} from "@adaptive-world/db/schema";
import { and, eq, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import type { ApiErrorCode } from "./api";
import { transactionalDb } from "./database";
import type { PortalActor } from "./session";
import {
  DEMO_RESET_OPERATOR_ID,
  DEMO_RESET_OPERATOR_SUBJECT,
  isDemoResetOperator,
} from "./demo-reset-authorization";

const DEMO_OWNER_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_DOCTOR_ID = DEMO_RESET_OPERATOR_ID;
const MAYA_OWNER_ID = "00000000-0000-4000-8000-000000000004";
const DEMO_PATIENT_IDS = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000004",
] as const;
const DEMO_RELATIONSHIPS = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    patientId: DEMO_PATIENT_IDS[0],
    ownerId: DEMO_OWNER_ID,
    grantId: "30000000-0000-4000-8000-000000000001",
    scopes: [
      "passport.summary.read",
      "passport.clinical.read",
      "passport.documents.read",
      "passport.guidance.write",
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    patientId: DEMO_PATIENT_IDS[1],
    ownerId: MAYA_OWNER_ID,
    grantId: "30000000-0000-4000-8000-000000000004",
    scopes: ["passport.summary.read", "passport.clinical.read", "passport.guidance.write"],
  },
] as const;
const SEED_GUIDANCE_ID = "40000000-0000-4000-8000-000000000001";
const SEED_GUIDANCE =
  "Favor gradual progression during the first visits and stop the activity if any listed warning signal appears.";
const ROUTINE_PRO_ENTITLEMENT_KEY = "adaptive_world.routine_pro.v1";

export class DemoResetError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DemoResetError";
  }
}

export type DemoResetResult = {
  restoredRelationships: number;
  removedSavedRoutines: number;
  removedGymSessions: number;
  removedContextGrants: number;
  revokedEntitlements: number;
};

export async function resetSyntheticDemo(
  actor: PortalActor,
  currentRequestId: string,
  now = new Date(),
): Promise<DemoResetResult> {
  if (process.env.ENABLE_DEMO_RESET !== "true") {
    throw new DemoResetError("UNAVAILABLE", "Synthetic demo reset is disabled.", 503);
  }
  if (!isDemoResetOperator(actor)) {
    throw new DemoResetError(
      "FORBIDDEN",
      "Only the clinician demo operator can reset the synthetic demo.",
      403,
    );
  }

  return transactionalDb.transaction(async (tx) => {
    const [knownActor] = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.id, actor.id),
          eq(users.authSubject, DEMO_RESET_OPERATOR_SUBJECT),
          eq(users.role, "doctor"),
          isNull(users.disabledAt),
        ),
      )
      .limit(1);
    if (!knownActor) {
      throw new DemoResetError(
        "FORBIDDEN",
        "Only the clinician demo operator can reset the synthetic demo.",
        403,
      );
    }

    await tx.execute(sql`
      select id from patients
      where id in (${sql.join(
        DEMO_PATIENT_IDS.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
        and synthetic_demo = true
      order by id
      for update
    `);
    const syntheticRows = await tx
      .select({ id: patients.id })
      .from(patients)
      .where(and(inArray(patients.id, [...DEMO_PATIENT_IDS]), eq(patients.syntheticDemo, true)));
    if (syntheticRows.length !== DEMO_PATIENT_IDS.length) {
      throw new DemoResetError("UNAVAILABLE", "Canonical demo records are unavailable.", 503);
    }

    // Match the commerce lock order: patient, order, provider setup, bucket, reservation.
    // This keeps every safety decision and state transition inside one connection.
    await tx.execute(sql`
      select id from commerce_orders
      where patient_id in (${sql.join(
        DEMO_PATIENT_IDS.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      order by id
      for update
    `);
    await tx.execute(sql`
      select setup.id from payment_provider_setups setup
      join commerce_orders orders on orders.id = setup.order_id
      where orders.patient_id in (${sql.join(
        DEMO_PATIENT_IDS.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      order by setup.id
      for update of setup
    `);
    await tx.execute(sql`
      select bucket.id from agent_budget_buckets bucket
      join agent_budget_reservations reservation on reservation.bucket_id = bucket.id
      join commerce_orders orders on orders.id = reservation.order_id
      where orders.patient_id in (${sql.join(
        DEMO_PATIENT_IDS.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      order by bucket.id
      for update of bucket
    `);
    await tx.execute(sql`
      select reservation.id from agent_budget_reservations reservation
      join commerce_orders orders on orders.id = reservation.order_id
      where orders.patient_id in (${sql.join(
        DEMO_PATIENT_IDS.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      order by reservation.id
      for update of reservation
    `);

    const ambiguousOrders = await tx
      .select({ id: commerceOrders.id })
      .from(commerceOrders)
      .where(
        and(
          inArray(commerceOrders.patientId, [...DEMO_PATIENT_IDS]),
          inArray(commerceOrders.status, [
            "payment_submitted",
            "reconciliation_required",
            "paid_unfulfilled",
          ]),
        ),
      )
      .limit(1);
    const ambiguousSetups = await tx
      .select({ id: paymentProviderSetups.id })
      .from(paymentProviderSetups)
      .innerJoin(commerceOrders, eq(paymentProviderSetups.orderId, commerceOrders.id))
      .where(
        and(
          inArray(commerceOrders.patientId, [...DEMO_PATIENT_IDS]),
          notInArray(commerceOrders.status, [
            "fulfilled",
            "duplicate_paid",
            "refund_pending",
            "refunded",
          ]),
          or(
            inArray(paymentProviderSetups.status, [
              "requesting",
              "attached",
              "reconciliation_required",
            ]),
            and(
              eq(paymentProviderSetups.status, "prepared"),
              isNotNull(paymentProviderSetups.firstRequestStartedAt),
            ),
          ),
        ),
      )
      .limit(1);
    const ambiguousBudget = await tx
      .select({ id: agentBudgetReservations.id })
      .from(agentBudgetReservations)
      .innerJoin(commerceOrders, eq(agentBudgetReservations.orderId, commerceOrders.id))
      .where(
        and(
          inArray(commerceOrders.patientId, [...DEMO_PATIENT_IDS]),
          inArray(agentBudgetReservations.status, ["submitted", "reconciliation_required"]),
        ),
      )
      .limit(1);
    if (ambiguousOrders.length || ambiguousSetups.length || ambiguousBudget.length) {
      throw new DemoResetError(
        "CONFLICT",
        "Payment state must be reconciled before restoring the synthetic demo.",
        409,
      );
    }

    const safePreparedSetups = await tx
      .select({ id: paymentProviderSetups.id })
      .from(paymentProviderSetups)
      .innerJoin(commerceOrders, eq(paymentProviderSetups.orderId, commerceOrders.id))
      .where(
        and(
          inArray(commerceOrders.patientId, [...DEMO_PATIENT_IDS]),
          inArray(commerceOrders.status, ["created", "provider_pending"]),
          eq(paymentProviderSetups.provider, "stripe_checkout"),
          eq(paymentProviderSetups.status, "prepared"),
          isNull(paymentProviderSetups.firstRequestStartedAt),
        ),
      );
    if (safePreparedSetups.length) {
      await tx
        .update(paymentProviderSetups)
        .set({
          status: "failed_terminal",
          lastErrorCode: "SYNTHETIC_DEMO_RESET_BEFORE_PROVIDER_REQUEST",
          updatedAt: now,
        })
        .where(
          inArray(
            paymentProviderSetups.id,
            safePreparedSetups.map((setup) => setup.id),
          ),
        );
    }

    const releasedReservations = await tx
      .select({
        id: agentBudgetReservations.id,
        bucketId: agentBudgetReservations.bucketId,
        amountMinor: agentBudgetReservations.amountMinor,
      })
      .from(agentBudgetReservations)
      .innerJoin(commerceOrders, eq(agentBudgetReservations.orderId, commerceOrders.id))
      .where(
        and(
          inArray(commerceOrders.patientId, [...DEMO_PATIENT_IDS]),
          eq(agentBudgetReservations.status, "reserved"),
        ),
      );
    for (const reservation of releasedReservations) {
      await tx
        .update(agentBudgetReservations)
        .set({
          status: "released",
          releasedAt: now,
          releaseReason: "synthetic_demo_reset_before_submission",
          updatedAt: now,
        })
        .where(eq(agentBudgetReservations.id, reservation.id));
      await tx
        .update(agentBudgetBuckets)
        .set({
          reservedMinor: sql`greatest(0, ${agentBudgetBuckets.reservedMinor} - ${reservation.amountMinor})`,
          updatedAt: now,
        })
        .where(eq(agentBudgetBuckets.id, reservation.bucketId));
    }

    const removedRoutines = await tx
      .delete(savedRoutines)
      .where(inArray(savedRoutines.patientId, [...DEMO_PATIENT_IDS]))
      .returning({ id: savedRoutines.id });
    const revokedEntitlements = await tx
      .update(entitlementGrants)
      .set({ status: "revoked", revokedAt: now, updatedAt: now })
      .where(
        and(
          inArray(entitlementGrants.patientId, [...DEMO_PATIENT_IDS]),
          eq(entitlementGrants.entitlementKey, ROUTINE_PRO_ENTITLEMENT_KEY),
          eq(entitlementGrants.status, "active"),
        ),
      )
      .returning({ id: entitlementGrants.id });
    await tx
      .update(commerceOrders)
      .set({
        status: "voided",
        voidedAt: now,
        failureCode: "SYNTHETIC_DEMO_RESET_BEFORE_SUBMISSION",
        updatedAt: now,
      })
      .where(
        and(
          inArray(commerceOrders.patientId, [...DEMO_PATIENT_IDS]),
          inArray(commerceOrders.status, ["created", "provider_pending"]),
        ),
      );

    const removedSessions = await tx
      .delete(gymSessions)
      .where(inArray(gymSessions.patientId, [...DEMO_PATIENT_IDS]))
      .returning({ id: gymSessions.id });
    const removedContext = await tx
      .delete(contextGrants)
      .where(inArray(contextGrants.patientId, [...DEMO_PATIENT_IDS]))
      .returning({ id: contextGrants.id });

    await tx
      .delete(clinicalGuidance)
      .where(
        and(
          inArray(clinicalGuidance.patientId, [...DEMO_PATIENT_IDS]),
          eq(clinicalGuidance.doctorUserId, DEMO_DOCTOR_ID),
        ),
      );
    await tx.delete(accessGrants).where(
      and(
        inArray(accessGrants.patientId, [...DEMO_PATIENT_IDS]),
        eq(accessGrants.granteeUserId, DEMO_DOCTOR_ID),
        notInArray(
          accessGrants.id,
          DEMO_RELATIONSHIPS.map((relationship) => relationship.grantId),
        ),
      ),
    );

    const expiresAt = new Date(now.getTime() + 180 * 24 * 60 * 60 * 1_000);
    for (const relationship of DEMO_RELATIONSHIPS) {
      await tx
        .insert(doctorPatientRelationships)
        .values({
          id: relationship.id,
          patientId: relationship.patientId,
          doctorUserId: DEMO_DOCTOR_ID,
          invitedByUserId: relationship.ownerId,
          status: "active",
          activatedAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: doctorPatientRelationships.id,
          set: {
            patientId: relationship.patientId,
            doctorUserId: DEMO_DOCTOR_ID,
            status: "active",
            invitedByUserId: relationship.ownerId,
            activatedAt: now,
            expiresAt,
            revokedAt: null,
            updatedAt: now,
          },
        });
      await tx
        .insert(accessGrants)
        .values({
          id: relationship.grantId,
          patientId: relationship.patientId,
          granteeUserId: DEMO_DOCTOR_ID,
          relationshipId: relationship.id,
          createdByUserId: relationship.ownerId,
          purpose: "Synthetic continuity-of-care demonstration",
          status: "active",
          scopes: [...relationship.scopes],
          expiresAt,
        })
        .onConflictDoUpdate({
          target: accessGrants.id,
          set: {
            patientId: relationship.patientId,
            granteeUserId: DEMO_DOCTOR_ID,
            relationshipId: relationship.id,
            createdByUserId: relationship.ownerId,
            status: "active",
            scopes: [...relationship.scopes],
            expiresAt,
            revokedAt: null,
            revokedByUserId: null,
            updatedAt: now,
          },
        });
    }

    await tx
      .insert(clinicalGuidance)
      .values({
        id: SEED_GUIDANCE_ID,
        patientId: DEMO_PATIENT_IDS[0],
        doctorUserId: DEMO_DOCTOR_ID,
        relationshipId: DEMO_RELATIONSHIPS[0].id,
        accessGrantId: DEMO_RELATIONSHIPS[0].grantId,
        guidance: SEED_GUIDANCE,
        expiresAt,
      })
      .onConflictDoUpdate({
        target: clinicalGuidance.id,
        set: {
          patientId: DEMO_PATIENT_IDS[0],
          doctorUserId: DEMO_DOCTOR_ID,
          relationshipId: DEMO_RELATIONSHIPS[0].id,
          accessGrantId: DEMO_RELATIONSHIPS[0].grantId,
          guidance: SEED_GUIDANCE,
          expiresAt,
          revokedAt: null,
          updatedAt: now,
        },
      });

    await tx.insert(auditEvents).values({
      actorUserId: actor.id,
      patientId: DEMO_PATIENT_IDS[0],
      action: "demo.reset",
      resourceType: "synthetic_demo",
      outcome: "success",
      requestId: currentRequestId,
      metadata: {
        syntheticDemo: true,
        resetVersion: 1,
        removedSavedRoutineCount: removedRoutines.length,
      },
    });

    return {
      restoredRelationships: DEMO_RELATIONSHIPS.length,
      removedSavedRoutines: removedRoutines.length,
      removedGymSessions: removedSessions.length,
      removedContextGrants: removedContext.length,
      revokedEntitlements: revokedEntitlements.length,
    };
  });
}
