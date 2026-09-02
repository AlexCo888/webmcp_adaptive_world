import {
  AgentGeneratedRoutineSchema,
  GeneratedSessionSchema,
  type AgentGeneratedRoutine,
  type GeneratedSession,
} from "@adaptive-world/contracts";
import { canonicalizeJson, sha256Hex, verifySha256Hex } from "@adaptive-world/security";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import type { getGymSession } from "@/lib/gym-session";
import { toPublicGymContext } from "@/lib/gym-session";
import { toPublicGymRoutineId } from "@/lib/public-identifiers";
import {
  AGENT_GENERATED_TEMPLATE_ID,
  AGENT_GENERATED_TEMPLATE_VERSION,
  createAgentGeneratedSession,
} from "@/lib/session-planner";
import { ROUTINE_PRO } from "./constants";
import { withCommerceTransaction } from "./database";
import { CommerceError } from "./http";
import { withLockedLiveGymSessionAuthority } from "./live-session-authority";

type ActiveGymSession = NonNullable<Awaited<ReturnType<typeof getGymSession>>>;

type SavedRow = {
  id: string;
  plan: unknown;
  plan_hash: string;
};

export function prepareAgentGeneratedRoutine({
  active,
  routine,
  goal,
}: {
  active: ActiveGymSession;
  routine: AgentGeneratedRoutine;
  goal: string;
}): GeneratedSession {
  const parsedRoutine = AgentGeneratedRoutineSchema.safeParse(routine);
  if (!parsedRoutine.success) throw new CommerceError("INVALID_REQUEST");
  try {
    return GeneratedSessionSchema.parse(
      createAgentGeneratedSession({
        profile: toPublicGymContext(active.stored, active.row.id),
        equipment: equipmentCatalog,
        routine: parsedRoutine.data,
        goal,
        sessionId: toPublicGymRoutineId(active.row.id),
      }),
    );
  } catch {
    throw new CommerceError("INVALID_REQUEST");
  }
}

export async function savePreparedPersonalizedRoutine({
  active,
  session,
}: {
  active: ActiveGymSession;
  session: GeneratedSession;
}): Promise<{ session: GeneratedSession; savedRoutineRef: string; reused: boolean }> {
  const patientId = active.row.patientId;
  if (!patientId) throw new CommerceError("CONTEXT_REQUIRED");
  const validatedSession = GeneratedSessionSchema.parse(session);
  if (
    validatedSession.createdVia !== "webmcp" ||
    validatedSession.generationMode !== "agent_generated" ||
    validatedSession.templateId !== AGENT_GENERATED_TEMPLATE_ID ||
    validatedSession.templateVersion !== AGENT_GENERATED_TEMPLATE_VERSION
  ) {
    throw new CommerceError("INVALID_REQUEST");
  }

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

        const canonicalPlan = canonicalizeJson(validatedSession);
        const existing = await client.query<SavedRow>(
          `SELECT id, plan, plan_hash FROM saved_routines
           WHERE patient_id = $1 AND source_gym_session_id = $2 AND template_id = $3
           LIMIT 1 FOR UPDATE`,
          [patientId, active.row.id, AGENT_GENERATED_TEMPLATE_ID],
        );
        if (existing.rows[0]) {
          const canonicalExisting = canonicalizeJson(existing.rows[0].plan);
          if (!(await verifySha256Hex(canonicalExisting, existing.rows[0].plan_hash))) {
            throw new CommerceError("RECONCILIATION_REQUIRED");
          }
          if (canonicalExisting !== canonicalPlan) throw new CommerceError("ROUTINE_CONFLICT");
          await client.query(
            "UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1",
            [active.row.id, canonicalExisting],
          );
          return {
            session: GeneratedSessionSchema.parse(existing.rows[0].plan),
            savedRoutineRef: existing.rows[0].id,
            reused: true,
          };
        }

        const planHash = await sha256Hex(canonicalPlan);
        const saved = await client.query<{ id: string }>(
          `INSERT INTO saved_routines (
             patient_id, source_gym_session_id, entitlement_grant_id, title, plan, plan_hash,
             template_id, template_version, catalog_version, created_via, saved_at
           ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,now()) RETURNING id`,
          [
            patientId,
            active.row.id,
            entitlementId,
            validatedSession.title,
            canonicalPlan,
            planHash,
            AGENT_GENERATED_TEMPLATE_ID,
            AGENT_GENERATED_TEMPLATE_VERSION,
            validatedSession.catalogVersion,
            "webmcp",
          ],
        );
        const savedRoutineRef = saved.rows[0]?.id;
        if (!savedRoutineRef) throw new CommerceError("INTERNAL_ERROR", true);
        await client.query(
          "UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1",
          [active.row.id, canonicalPlan],
        );
        await client.query(
          `INSERT INTO audit_events (
             patient_id, action, resource_type, resource_id, outcome, metadata
           ) VALUES ($1,'routine.personalized.saved','saved_routine',$2,'success',$3::jsonb)`,
          [
            patientId,
            savedRoutineRef,
            JSON.stringify({
              templateId: AGENT_GENERATED_TEMPLATE_ID,
              templateVersion: AGENT_GENERATED_TEMPLATE_VERSION,
              generationMode: "agent_generated",
              catalogVersion: validatedSession.catalogVersion,
              initiatedVia: "webmcp",
              naturalLanguageGoal: true,
              healthFields: false,
            }),
          ],
        );
        return { session: validatedSession, savedRoutineRef, reused: false };
      },
    );
  });
}

export async function createAndSavePersonalizedRoutine({
  active,
  routine,
  goal,
}: {
  active: ActiveGymSession;
  routine: AgentGeneratedRoutine;
  goal: string;
}): Promise<{ session: GeneratedSession; savedRoutineRef: string; reused: boolean }> {
  const session = prepareAgentGeneratedRoutine({ active, routine, goal });
  return savePreparedPersonalizedRoutine({ active, session });
}
