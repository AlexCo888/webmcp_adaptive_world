import {
  GeneratedSessionSchema,
  RoutineGoalSchema,
  type AgentGeneratedRoutineInput,
  type GeneratedSession,
  type RoutinePaymentModeSchema,
} from "@adaptive-world/contracts";
import type { PoolClient } from "@adaptive-world/db";
import type { z } from "zod";
import type { getGymSession } from "@/lib/gym-session";
import {
  AGENT_GENERATED_ROUTINE_MARKER,
  agentRoutineInputMatchesSession,
} from "@/lib/session-planner";
import { ROUTINE_PRO } from "./constants";
import { commercePool, withCommerceTransaction } from "./database";
import { CommerceError } from "./http";
import { withLockedLiveGymSessionAuthority } from "./live-session-authority";

type ActiveGymSession = NonNullable<Awaited<ReturnType<typeof getGymSession>>>;
type PaymentMode = z.infer<typeof RoutinePaymentModeSchema>;

export type RoutineProOrder = {
  id: string;
  publicRef: string;
  patientId: string;
  gymSessionId: string | null;
  payerKind: "human" | "agent";
  provider: "stripe_checkout" | "mpp_tempo";
  initiatedVia: "site-ui" | "webmcp";
  initialTemplateId: string;
  initialGoal: string | null;
  amountMinor: number;
  currency: string;
  status:
    | "created"
    | "provider_pending"
    | "payment_submitted"
    | "reconciliation_required"
    | "paid_unfulfilled"
    | "fulfilled"
    | "failed"
    | "expired"
    | "voided"
    | "duplicate_paid"
    | "refund_pending"
    | "refunded";
  providerPaymentRef: string | null;
  refundReference: string | null;
  submittedAt: Date | null;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  createdAt: Date;
  capabilityVersion: number | null;
  capabilityDigest: string | null;
  capabilityExpiresAt: Date | null;
};

type OrderRow = {
  id: string;
  public_ref: string;
  patient_id: string;
  originating_gym_session_id: string | null;
  payer_kind: "human" | "agent";
  provider: "stripe_checkout" | "mpp_tempo";
  initiated_via: "site-ui" | "webmcp";
  initial_template_id: string;
  initial_goal: string | null;
  amount_minor: number;
  currency: string;
  status: RoutineProOrder["status"];
  provider_payment_ref: string | null;
  refund_reference: string | null;
  submitted_at: Date | null;
  paid_at: Date | null;
  fulfilled_at: Date | null;
  created_at: Date;
  capability_version: number | null;
  capability_digest: string | null;
  capability_expires_at: Date | null;
};

function mapOrder(row: OrderRow): RoutineProOrder {
  return {
    id: row.id,
    publicRef: row.public_ref,
    patientId: row.patient_id,
    gymSessionId: row.originating_gym_session_id,
    payerKind: row.payer_kind,
    provider: row.provider,
    initiatedVia: row.initiated_via,
    initialTemplateId: row.initial_template_id,
    initialGoal: row.initial_goal,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
    providerPaymentRef: row.provider_payment_ref,
    refundReference: row.refund_reference,
    submittedAt: row.submitted_at,
    paidAt: row.paid_at,
    fulfilledAt: row.fulfilled_at,
    createdAt: row.created_at,
    capabilityVersion: row.capability_version,
    capabilityDigest: row.capability_digest,
    capabilityExpiresAt: row.capability_expires_at,
  };
}

export function assertRoutineOrderInput(
  order: RoutineProOrder,
  input: {
    gymSessionId: string;
    goal: string;
    routine: AgentGeneratedRoutineInput;
    stagedSession: GeneratedSession;
  },
): void {
  const requestedGoal = RoutineGoalSchema.parse(input.goal);
  if (
    order.initialTemplateId !== AGENT_GENERATED_ROUTINE_MARKER ||
    order.initialGoal !== requestedGoal ||
    order.gymSessionId !== input.gymSessionId ||
    !agentRoutineInputMatchesSession({
      session: input.stagedSession,
      goal: requestedGoal,
      routine: input.routine,
    })
  ) {
    throw new CommerceError("ORDER_PENDING", true);
  }
}

async function lockPatient(client: PoolClient, patientId: string): Promise<void> {
  const result = await client.query<{ id: string }>(
    "SELECT id FROM patients WHERE id = $1 FOR UPDATE",
    [patientId],
  );
  if (result.rowCount !== 1) throw new CommerceError("CONTEXT_EXPIRED");
}

export async function hasRoutineProEntitlement(
  patientId: string,
  client?: PoolClient,
): Promise<boolean> {
  const query = client ?? commercePool;
  const result = await query.query<{ found: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM entitlement_grants
       WHERE patient_id = $1 AND entitlement_key = $2 AND status = 'active'
     ) AS found`,
    [patientId, ROUTINE_PRO.entitlementKey],
  );
  return result.rows[0]?.found === true;
}

export async function getPayableOrder(patientId: string): Promise<RoutineProOrder | null> {
  const result = await commercePool.query<OrderRow>(
    `SELECT * FROM commerce_orders
     WHERE patient_id = $1 AND product_key = $2
       AND status = ANY($3::commerce_order_status[])
     ORDER BY created_at ASC LIMIT 1`,
    [
      patientId,
      ROUTINE_PRO.productKey,
      [
        "created",
        "provider_pending",
        "payment_submitted",
        "reconciliation_required",
        "paid_unfulfilled",
      ],
    ],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

export async function getLatestRoutineProOrderForSession(
  patientId: string,
  gymSessionId: string,
): Promise<RoutineProOrder | null> {
  const result = await commercePool.query<OrderRow>(
    `SELECT * FROM commerce_orders
     WHERE patient_id = $1 AND product_key = $2 AND originating_gym_session_id = $3
     ORDER BY created_at DESC LIMIT 1`,
    [patientId, ROUTINE_PRO.productKey, gymSessionId],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

export async function getRoutineProOrderOutcome(orderId: string): Promise<{
  entitlementGranted: boolean;
  savedRoutineRef: string | null;
}> {
  const result = await commercePool.query<{
    entitlement_granted: boolean;
    saved_routine_ref: string | null;
  }>(
    `SELECT EXISTS (
       SELECT 1 FROM entitlement_grants
       WHERE source_order_id = co.id AND entitlement_key = $2 AND status = 'active'
     ) AS entitlement_granted,
     (
       SELECT sr.id FROM entitlement_grants eg
       INNER JOIN saved_routines sr ON sr.entitlement_grant_id = eg.id
       WHERE eg.source_order_id = co.id AND eg.entitlement_key = $2
         AND eg.status = 'active' AND sr.source_gym_session_id = co.originating_gym_session_id
         AND sr.template_id = $3
       ORDER BY sr.saved_at DESC LIMIT 1
     ) AS saved_routine_ref
     FROM commerce_orders co WHERE co.id = $1 LIMIT 1`,
    [orderId, ROUTINE_PRO.entitlementKey, AGENT_GENERATED_ROUTINE_MARKER],
  );
  return {
    entitlementGranted: result.rows[0]?.entitlement_granted === true,
    savedRoutineRef: result.rows[0]?.saved_routine_ref ?? null,
  };
}

export async function createOrReuseRoutineProOrder({
  active,
  session,
  routine,
  goal,
  paymentMode,
}: {
  active: ActiveGymSession;
  session: GeneratedSession;
  routine: AgentGeneratedRoutineInput;
  goal: string;
  paymentMode: PaymentMode;
}): Promise<{
  entitled: boolean;
  order: RoutineProOrder | null;
  reused: boolean;
  session: GeneratedSession;
}> {
  const patientId = active.row.patientId;
  if (!patientId) throw new CommerceError("CONTEXT_REQUIRED");
  const requestedGoal = RoutineGoalSchema.parse(goal);
  if (
    session.templateId !== AGENT_GENERATED_ROUTINE_MARKER ||
    session.generationMode !== "agent_generated" ||
    session.createdVia !== "webmcp" ||
    session.goal !== requestedGoal ||
    !agentRoutineInputMatchesSession({ session, goal: requestedGoal, routine })
  ) {
    throw new CommerceError("INVALID_REQUEST");
  }
  const provider = paymentMode === "human_checkout" ? "stripe_checkout" : "mpp_tempo";
  const payerKind = paymentMode === "human_checkout" ? "human" : "agent";

  return withCommerceTransaction(async (client) => {
    await lockPatient(client, patientId);
    return withLockedLiveGymSessionAuthority(
      client,
      {
        anonymousSubjectId: active.subjectId,
        contextGrantId: active.grant.id,
        internalSessionId: active.row.id,
        patientId,
        projection: active.stored,
        projectionValidUntil: active.stored.validUntil,
      },
      async () => {
        if (await hasRoutineProEntitlement(patientId, client)) {
          return { entitled: true, order: null, reused: true, session };
        }

        const existing = await client.query<OrderRow>(
          `SELECT * FROM commerce_orders
           WHERE patient_id = $1 AND product_key = $2
             AND status IN ('created','provider_pending','payment_submitted','reconciliation_required','paid_unfulfilled')
           ORDER BY created_at ASC LIMIT 1 FOR UPDATE`,
          [patientId, ROUTINE_PRO.productKey],
        );
        const row = existing.rows[0];
        if (row) {
          if (row.provider !== provider) throw new CommerceError("ORDER_PENDING", true);
          const staged = await client.query<{ plan: unknown }>(
            "SELECT plan FROM gym_sessions WHERE id = $1 LIMIT 1",
            [active.row.id],
          );
          const parsed = GeneratedSessionSchema.safeParse(staged.rows[0]?.plan);
          if (!parsed.success) throw new CommerceError("RECONCILIATION_REQUIRED");
          const order = mapOrder(row);
          assertRoutineOrderInput(order, {
            gymSessionId: active.row.id,
            goal: requestedGoal,
            routine,
            stagedSession: parsed.data,
          });
          return { entitled: false, order, reused: true, session: parsed.data };
        }

        await client.query(
          "UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1",
          [active.row.id, JSON.stringify(session)],
        );
        const publicRef = `awrp_${crypto.randomUUID().replaceAll("-", "")}`;
        const inserted = await client.query<OrderRow>(
          `INSERT INTO commerce_orders (
             public_ref, patient_id, originating_gym_session_id, product_key,
             payer_kind, provider, initiated_via, initial_template_id, initial_goal,
             amount_minor, currency, status
           ) VALUES ($1,$2,$3,$4,$5,$6,'webmcp',$7,$8,$9,$10,'provider_pending')
           RETURNING *`,
          [
            publicRef,
            patientId,
            active.row.id,
            ROUTINE_PRO.productKey,
            payerKind,
            provider,
            AGENT_GENERATED_ROUTINE_MARKER,
            requestedGoal,
            ROUTINE_PRO.amountMinor,
            ROUTINE_PRO.currency,
          ],
        );
        const created = inserted.rows[0];
        if (!created) throw new CommerceError("INTERNAL_ERROR", true);
        await client.query(
          `INSERT INTO audit_events (
             actor_user_id, patient_id, action, resource_type, resource_id, outcome, metadata
           ) VALUES (NULL,$1,'commerce.order.created','commerce_order',$2,'success',$3::jsonb)`,
          [
            patientId,
            created.id,
            JSON.stringify({
              publicRef,
              productKey: ROUTINE_PRO.productKey,
              payerKind,
              provider,
              initiatedVia: "webmcp",
              generationMode: "agent_generated",
              exactRoutineStaged: true,
              naturalLanguageGoal: true,
              sandbox: true,
            }),
          ],
        );
        return { entitled: false, order: mapOrder(created), reused: false, session };
      },
    );
  });
}

export async function getOrderByPublicRefForPatient(
  publicRef: string,
  patientId: string,
): Promise<RoutineProOrder | null> {
  const result = await commercePool.query<OrderRow>(
    "SELECT * FROM commerce_orders WHERE public_ref = $1 AND patient_id = $2 LIMIT 1",
    [publicRef, patientId],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

export async function getOrderByPublicRefInternal(
  publicRef: string,
): Promise<RoutineProOrder | null> {
  const result = await commercePool.query<OrderRow>(
    "SELECT * FROM commerce_orders WHERE public_ref = $1 LIMIT 1",
    [publicRef],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

export async function getStripeOrderByPaymentIntentInternal(
  paymentIntent: string,
): Promise<RoutineProOrder | null> {
  const result = await commercePool.query<OrderRow>(
    `SELECT * FROM commerce_orders
     WHERE provider = 'stripe_checkout' AND provider_payment_ref = $1
     LIMIT 1`,
    [paymentIntent],
  );
  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}
