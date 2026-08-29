import { GeneratedSessionSchema, type GeneratedSession } from "@adaptive-world/contracts";
import { canonicalizeJson, sha256Hex, verifySha256Hex } from "@adaptive-world/security";
import { equipmentCatalog } from "@adaptive-world/demo-data";
import type { getGymSession } from "@/lib/gym-session";
import { toPublicGymContext } from "@/lib/gym-session";
import { toPublicGymRoutineId } from "@/lib/public-identifiers";
import { createGroundedSession, type FacilityTemplate } from "@/lib/session-planner";
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

export async function createAndSavePersonalizedRoutine({
  active,
  templateId,
  initiatedVia,
}: {
  active: ActiveGymSession;
  templateId: FacilityTemplate["id"];
  initiatedVia: "site-ui" | "webmcp";
}): Promise<{ session: GeneratedSession; savedRoutineRef: string; reused: boolean }> {
  const patientId = active.row.patientId;
  if (!patientId) throw new CommerceError("CONTEXT_REQUIRED");

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

        const existing = await client.query<SavedRow>(
          `SELECT id, plan, plan_hash FROM saved_routines
           WHERE patient_id = $1 AND source_gym_session_id = $2 AND template_id = $3
           LIMIT 1 FOR UPDATE`,
          [patientId, active.row.id, templateId],
        );
        if (existing.rows[0]) {
          const canonicalExisting = canonicalizeJson(existing.rows[0].plan);
          if (!(await verifySha256Hex(canonicalExisting, existing.rows[0].plan_hash))) {
            throw new CommerceError("RECONCILIATION_REQUIRED");
          }
          const session = GeneratedSessionSchema.parse(existing.rows[0].plan);
          await client.query(
            "UPDATE gym_sessions SET plan = $2::jsonb, status = 'draft' WHERE id = $1",
            [active.row.id, canonicalExisting],
          );
          return {
            session,
            savedRoutineRef: existing.rows[0].id,
            reused: true,
          };
        }

        const session = GeneratedSessionSchema.parse(
          createGroundedSession({
            profile: toPublicGymContext(active.stored, active.row.id),
            equipment: equipmentCatalog,
            templateId,
            createdVia: initiatedVia,
            sessionId: toPublicGymRoutineId(active.row.id),
          }),
        );
        const canonicalPlan = canonicalizeJson(session);
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
            session.title,
            canonicalPlan,
            planHash,
            session.templateId,
            session.templateVersion,
            session.catalogVersion,
            initiatedVia,
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
              templateId: session.templateId,
              templateVersion: session.templateVersion,
              catalogVersion: session.catalogVersion,
              initiatedVia,
              healthFields: false,
            }),
          ],
        );
        return { session, savedRoutineRef, reused: false };
      },
    );
  });
}
