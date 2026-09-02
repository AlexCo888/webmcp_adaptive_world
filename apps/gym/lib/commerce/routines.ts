import {
  GeneratedSessionSchema,
  type ConfirmRoutineRequest,
  type GeneratedSession,
  type RoutineProIntent,
} from "@adaptive-world/contracts";
import type { PoolClient } from "@adaptive-world/db";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { canonicalizeJson, sha256Hex, verifySha256Hex } from "@adaptive-world/security";
import type { getGymSession } from "@/lib/gym-session";
import { toPublicGymContext, toPublicGymRoutineId } from "@/lib/gym-session";
import {
  RoutineValidationError,
  createAgentGeneratedSession,
  createGroundedSession,
  routineIntentMatchesSession,
  routineIntentProvenanceId,
  validateStagedRoutineSession,
} from "@/lib/session-planner";
import { withCommerceTransaction } from "./database";
import { CommerceError } from "./http";
import { withLockedLiveGymSessionAuthority } from "./live-session-authority";

type ActiveGymSession = NonNullable<Awaited<ReturnType<typeof getGymSession>>>;
type StoredProjection = Parameters<typeof toPublicGymContext>[0];

type SavedRow = {
  id: string;
  plan: unknown;
  plan_hash: string;
};

/**
 * Strips the quote fields from a confirmed request and returns the exact
 * routine intent the person approved. Both intents are closed unions, so no
 * unexpected field can travel further into commerce or persistence.
 */
export function toRoutineIntent(request: ConfirmRoutineRequest): RoutineProIntent {
  if (request.initiatedVia === "webmcp") {
    return {
      initiatedVia: "webmcp",
      goal: request.goal,
      routine: request.routine,
      ...(request.paymentMode ? { paymentMode: request.paymentMode } : {}),
    };
  }
  return {
    initiatedVia: "site-ui",
    goal: request.goal,
    templateId: request.templateId,
    ...(request.paymentMode ? { paymentMode: request.paymentMode } : {}),
  };
}

function zodIssueSummary(error: Error): string | undefined {
  const issues = (error as { issues?: Array<{ path?: unknown[]; message?: string }> }).issues;
  const first = issues?.[0];
  if (!first?.message) return undefined;
  const path = Array.isArray(first.path) && first.path.length ? first.path.join(".") : "routine";
  return `${path}: ${first.message}`.slice(0, 160);
}

/**
 * Validation failures describe only the caller's own submitted routine. They
 * are surfaced as a bounded safe detail so an agent can correct the proposal
 * and resubmit without any payment having been attempted.
 */
export function asInvalidRoutine(error: unknown): never {
  if (error instanceof CommerceError) throw error;
  if (error instanceof RoutineValidationError) {
    throw new CommerceError("INVALID_REQUEST", false, error.message);
  }
  if (error instanceof Error && error.name === "ZodError") {
    throw new CommerceError("INVALID_REQUEST", false, zodIssueSummary(error));
  }
  throw error;
}

/**
 * Builds the exact plan for an intent without writing anything. Agent intents
 * are validated and hydrated; site intents ground a published staff walkthrough
 * in the same active projection. Neither path calls an AI model.
 */
export function validatePersonalizedRoutineRequest({
  active,
  intent,
}: {
  active: ActiveGymSession;
  intent: RoutineProIntent;
}): { session: GeneratedSession; intent: RoutineProIntent } {
  try {
    const profile = toPublicGymContext(active.stored, active.row.id);
    const sessionId = toPublicGymRoutineId(active.row.id);
    const session =
      intent.initiatedVia === "webmcp"
        ? createAgentGeneratedSession({
            profile,
            equipment: equipmentCatalog,
            goal: intent.goal,
            routine: intent.routine,
            sessionId,
          })
        : createGroundedSession({
            profile,
            equipment: equipmentCatalog,
            templateId: intent.templateId,
            goal: intent.goal,
            createdVia: "site-ui",
            sessionId,
          });
    return { session, intent };
  } catch (error) {
    return asInvalidRoutine(error);
  }
}

async function persistRoutinePlan(
  client: PoolClient,
  {
    patientId,
    gymSessionId,
    entitlementId,
    session,
  }: {
    patientId: string;
    gymSessionId: string;
    entitlementId: string;
    session: GeneratedSession;
  },
): Promise<{ session: GeneratedSession; savedRoutineRef: string; reused: boolean }> {
  const existing = await client.query<SavedRow>(
    `SELECT id, plan, plan_hash FROM saved_routines
     WHERE patient_id = $1 AND source_gym_session_id = $2 AND template_id = $3
     LIMIT 1 FOR UPDATE`,
    [patientId, gymSessionId, session.templateId],
  );
  if (existing.rows[0]) {
    const canonicalExisting = canonicalizeJson(existing.rows[0].plan);
    if (!(await verifySha256Hex(canonicalExisting, existing.rows[0].plan_hash))) {
      throw new CommerceError("RECONCILIATION_REQUIRED");
    }
    const parsed = GeneratedSessionSchema.safeParse(existing.rows[0].plan);
    if (!parsed.success || canonicalizeJson(parsed.data) !== canonicalizeJson(session)) {
      throw new CommerceError("ROUTINE_CONFLICT");
    }
    await client.query("UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1", [
      gymSessionId,
      canonicalExisting,
    ]);
    return {
      session: parsed.data,
      savedRoutineRef: existing.rows[0].id,
      reused: true,
    };
  }

  const canonicalPlan = canonicalizeJson(session);
  const planHash = await sha256Hex(canonicalPlan);
  const saved = await client.query<{ id: string }>(
    `INSERT INTO saved_routines (
       patient_id, source_gym_session_id, entitlement_grant_id, title, plan, plan_hash,
       template_id, template_version, catalog_version, created_via, saved_at
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,now()) RETURNING id`,
    [
      patientId,
      gymSessionId,
      entitlementId,
      session.title,
      canonicalPlan,
      planHash,
      session.templateId,
      session.templateVersion,
      session.catalogVersion,
      session.createdVia,
    ],
  );
  const savedRoutineRef = saved.rows[0]?.id;
  if (!savedRoutineRef) throw new CommerceError("INTERNAL_ERROR", true);
  await client.query("UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1", [
    gymSessionId,
    canonicalPlan,
  ]);
  await client.query(
    `INSERT INTO audit_events (
       patient_id, action, resource_type, resource_id, outcome, metadata
     ) VALUES ($1,'routine.personalized.saved','saved_routine',$2,'success',$3::jsonb)`,
    [
      patientId,
      savedRoutineRef,
      JSON.stringify({
        templateId: session.templateId,
        templateVersion: session.templateVersion,
        catalogVersion: session.catalogVersion,
        createdVia: session.createdVia,
        generationMode: session.generationMode,
        userSelectedAgentGeneratedContent: session.generationMode === "agent_generated",
        naturalLanguageGoal: true,
        fullPassportFields: false,
        requiresExpertReview: session.requiresExpertReview,
      }),
    ],
  );
  return { session, savedRoutineRef, reused: false };
}

/**
 * Completes routine persistence inside the same durable transaction that grants
 * Routine Pro. The payment provider never supplies exercise content; it only
 * points back to the exact validated plan staged on the bound Gym session.
 */
export async function persistStagedRoutineInTransaction(
  client: PoolClient,
  {
    orderId,
    patientId,
    gymSessionId,
    entitlementId,
  }: {
    orderId: string;
    patientId: string;
    gymSessionId: string | null;
    entitlementId: string;
  },
): Promise<{ savedRoutineRef: string }> {
  if (!gymSessionId) throw new CommerceError("RECONCILIATION_REQUIRED");
  const order = await client.query<{
    initial_goal: string | null;
    initial_template_id: string;
    initiated_via: "site-ui" | "webmcp";
  }>(
    `SELECT initial_template_id, initial_goal, initiated_via FROM commerce_orders
     WHERE id = $1 AND patient_id = $2 AND originating_gym_session_id = $3
     LIMIT 1`,
    [orderId, patientId, gymSessionId],
  );
  const orderRow = order.rows[0];
  if (!orderRow?.initial_goal) throw new CommerceError("RECONCILIATION_REQUIRED");
  const staged = await client.query<{
    context_projection: unknown;
    plan: unknown;
  }>(
    `SELECT context_projection, plan FROM gym_sessions
     WHERE id = $1 AND patient_id = $2 LIMIT 1 FOR UPDATE`,
    [gymSessionId, patientId],
  );
  const row = staged.rows[0];
  if (!row) throw new CommerceError("RECONCILIATION_REQUIRED");
  try {
    const profile = toPublicGymContext(row.context_projection as StoredProjection, gymSessionId);
    const session = validateStagedRoutineSession({
      session: row.plan,
      profile,
      equipment: equipmentCatalog,
    });
    if (
      session.goal !== orderRow.initial_goal ||
      session.templateId !== orderRow.initial_template_id ||
      session.createdVia !== orderRow.initiated_via
    ) {
      throw new CommerceError("ROUTINE_CONFLICT");
    }
    const saved = await persistRoutinePlan(client, {
      patientId,
      gymSessionId,
      entitlementId,
      session,
    });
    return { savedRoutineRef: saved.savedRoutineRef };
  } catch (error) {
    return asInvalidRoutine(error);
  }
}

/**
 * Saves the exact confirmed routine for an already-entitled person. When a
 * matching plan was staged before payment, that staged plan (already
 * re-validated) is saved; otherwise the freshly validated plan is saved.
 */
export async function createAndSavePersonalizedRoutine({
  active,
  intent,
}: {
  active: ActiveGymSession;
  intent: RoutineProIntent;
}): Promise<{ session: GeneratedSession; savedRoutineRef: string; reused: boolean }> {
  const patientId = active.row.patientId;
  if (!patientId) throw new CommerceError("CONTEXT_REQUIRED");
  const { session: validated } = validatePersonalizedRoutineRequest({ active, intent });
  const provenanceId = routineIntentProvenanceId(intent);

  return withCommerceTransaction(async (client) => {
    await client.query("SELECT id FROM patients WHERE id = $1 FOR UPDATE", [patientId]);
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
        const entitlement = await client.query<{ id: string }>(
          `SELECT id FROM entitlement_grants
           WHERE patient_id = $1 AND entitlement_key = 'adaptive_world.routine_pro.v1'
             AND status = 'active'
           ORDER BY granted_at DESC LIMIT 1`,
          [patientId],
        );
        const entitlementId = entitlement.rows[0]?.id;
        if (!entitlementId) throw new CommerceError("PAYMENT_REQUIRED");

        const staged = await client.query<{ plan: unknown }>(
          "SELECT plan FROM gym_sessions WHERE id = $1 LIMIT 1",
          [active.row.id],
        );
        const parsedStaged = GeneratedSessionSchema.safeParse(staged.rows[0]?.plan);
        let session = validated;
        if (
          parsedStaged.success &&
          routineIntentMatchesSession({ session: parsedStaged.data, intent })
        ) {
          try {
            session = validateStagedRoutineSession({
              session: parsedStaged.data,
              profile: toPublicGymContext(active.stored, active.row.id),
              equipment: equipmentCatalog,
            });
          } catch (error) {
            return asInvalidRoutine(error);
          }
        }

        const existing = await client.query<SavedRow>(
          `SELECT id, plan, plan_hash FROM saved_routines
           WHERE patient_id = $1 AND source_gym_session_id = $2 AND template_id = $3
           LIMIT 1 FOR UPDATE`,
          [patientId, active.row.id, provenanceId],
        );
        if (existing.rows[0]) {
          const canonicalExisting = canonicalizeJson(existing.rows[0].plan);
          if (!(await verifySha256Hex(canonicalExisting, existing.rows[0].plan_hash))) {
            throw new CommerceError("RECONCILIATION_REQUIRED");
          }
          const parsed = GeneratedSessionSchema.safeParse(existing.rows[0].plan);
          if (!parsed.success || !routineIntentMatchesSession({ session: parsed.data, intent })) {
            throw new CommerceError("ROUTINE_CONFLICT");
          }
          await client.query(
            "UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1",
            [active.row.id, canonicalExisting],
          );
          return {
            session: parsed.data,
            savedRoutineRef: existing.rows[0].id,
            reused: true,
          };
        }

        return persistRoutinePlan(client, {
          patientId,
          gymSessionId: active.row.id,
          entitlementId,
          session,
        });
      },
    );
  });
}
