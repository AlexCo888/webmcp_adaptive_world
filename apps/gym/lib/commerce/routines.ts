import {
  AgentGeneratedRoutineInputSchema,
  GeneratedSessionSchema,
  type AgentGeneratedRoutineInput,
  type GeneratedSession,
} from "@adaptive-world/contracts";
import type { PoolClient } from "@adaptive-world/db";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import { canonicalizeJson, sha256Hex, verifySha256Hex } from "@adaptive-world/security";
import type { getGymSession } from "@/lib/gym-session";
import { toPublicGymContext, toPublicGymRoutineId } from "@/lib/gym-session";
import {
  AGENT_GENERATED_ROUTINE_MARKER,
  AGENT_GENERATED_ROUTINE_VERSION,
  AgentRoutineValidationError,
  agentRoutineInputMatchesSession,
  createAgentGeneratedSession,
  validateStagedAgentGeneratedSession,
} from "@/lib/session-planner";
import { ROUTINE_PRO } from "./constants";
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

function asInvalidRoutine(error: unknown): never {
  if (
    error instanceof AgentRoutineValidationError ||
    (error instanceof Error && error.name === "ZodError")
  ) {
    throw new CommerceError("INVALID_REQUEST");
  }
  throw error;
}

export function validatePersonalizedRoutineRequest({
  active,
  goal,
  routine,
}: {
  active: ActiveGymSession;
  goal: string;
  routine: AgentGeneratedRoutineInput;
}): { session: GeneratedSession; routine: AgentGeneratedRoutineInput } {
  try {
    const submitted = AgentGeneratedRoutineInputSchema.parse(routine);
    return {
      routine: submitted,
      session: createAgentGeneratedSession({
        profile: toPublicGymContext(active.stored, active.row.id),
        equipment: equipmentCatalog,
        goal,
        routine: submitted,
        sessionId: toPublicGymRoutineId(active.row.id),
      }),
    };
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
    [patientId, gymSessionId, AGENT_GENERATED_ROUTINE_MARKER],
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
     ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,'webmcp',now()) RETURNING id`,
    [
      patientId,
      gymSessionId,
      entitlementId,
      session.title,
      canonicalPlan,
      planHash,
      AGENT_GENERATED_ROUTINE_MARKER,
      AGENT_GENERATED_ROUTINE_VERSION,
      session.catalogVersion,
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
        templateId: AGENT_GENERATED_ROUTINE_MARKER,
        templateVersion: AGENT_GENERATED_ROUTINE_VERSION,
        catalogVersion: session.catalogVersion,
        createdVia: "webmcp",
        generationMode: "agent_generated",
        userSelectedAgentGeneratedContent: true,
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
export async function persistStagedAgentRoutineInTransaction(
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
  }>(
    `SELECT initial_template_id, initial_goal FROM commerce_orders
     WHERE id = $1 AND patient_id = $2 AND originating_gym_session_id = $3
     LIMIT 1`,
    [orderId, patientId, gymSessionId],
  );
  const orderRow = order.rows[0];
  if (orderRow?.initial_template_id !== AGENT_GENERATED_ROUTINE_MARKER || !orderRow.initial_goal) {
    throw new CommerceError("RECONCILIATION_REQUIRED");
  }
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
    const session = validateStagedAgentGeneratedSession({
      session: row.plan,
      profile,
      equipment: equipmentCatalog,
    });
    if (session.goal !== orderRow.initial_goal) {
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

export async function createAndSavePersonalizedRoutine({
  active,
  goal,
  routine,
}: {
  active: ActiveGymSession;
  goal: string;
  routine: AgentGeneratedRoutineInput;
}): Promise<{ session: GeneratedSession; savedRoutineRef: string; reused: boolean }> {
  const patientId = active.row.patientId;
  if (!patientId) throw new CommerceError("CONTEXT_REQUIRED");
  const { session: validated, routine: submitted } = validatePersonalizedRoutineRequest({
    active,
    goal,
    routine,
  });

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
           WHERE patient_id = $1 AND entitlement_key = $2 AND status = 'active'
           FOR UPDATE`,
          [patientId, ROUTINE_PRO.entitlementKey],
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
          agentRoutineInputMatchesSession({
            session: parsedStaged.data,
            goal,
            routine: submitted,
          })
        ) {
          try {
            session = validateStagedAgentGeneratedSession({
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
          [patientId, active.row.id, AGENT_GENERATED_ROUTINE_MARKER],
        );
        if (existing.rows[0]) {
          const canonicalExisting = canonicalizeJson(existing.rows[0].plan);
          if (!(await verifySha256Hex(canonicalExisting, existing.rows[0].plan_hash))) {
            throw new CommerceError("RECONCILIATION_REQUIRED");
          }
          const parsed = GeneratedSessionSchema.safeParse(existing.rows[0].plan);
          if (
            !parsed.success ||
            !agentRoutineInputMatchesSession({ session: parsed.data, goal, routine: submitted })
          ) {
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
