import { GeneratedSessionSchema, type GeneratedSession } from "@adaptive-world/contracts";
import { equipment, patients, savedRoutines } from "@adaptive-world/db/schema";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { PortalActor } from "./session";
import { db } from "./database";
import { verifySavedRoutinePlanHash } from "./saved-routine-integrity";

export type SavedRoutineSummary = {
  id: string;
  title: string;
  savedAt: string;
  templateVersion: string;
};

export type SavedRoutineDetail = SavedRoutineSummary & {
  goal: string;
  durationMinutes: number;
  templateId: string;
  catalogVersion: string;
  createdVia: "site-ui" | "webmcp";
  generationMode: GeneratedSession["generationMode"];
  exercises: Array<
    GeneratedSession["exercises"][number] & {
      manufacturer: string;
      model: string;
      sourceUrl: string | null;
    }
  >;
  warmup: string[];
  cooldown: string[];
  safetyNotes: string[];
  requiresExpertReview: boolean;
  expertReviewReason?: string;
  decisionTrace: string[];
  synthetic: true;
};

export function savedRoutinesEnabled(): boolean {
  return process.env.ENABLE_SAVED_ROUTINES === "true";
}

export async function listSavedRoutines(actor: PortalActor): Promise<SavedRoutineSummary[]> {
  if (actor.role !== "owner" || !savedRoutinesEnabled()) return [];
  const rows = await db
    .select({
      id: savedRoutines.id,
      title: savedRoutines.title,
      savedAt: savedRoutines.savedAt,
      templateVersion: savedRoutines.templateVersion,
    })
    .from(savedRoutines)
    .innerJoin(patients, eq(savedRoutines.patientId, patients.id))
    .where(and(eq(patients.ownerUserId, actor.id), isNull(savedRoutines.archivedAt)))
    .orderBy(desc(savedRoutines.savedAt))
    .limit(20);

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    savedAt: row.savedAt.toISOString(),
    templateVersion: row.templateVersion,
  }));
}

export async function getSavedRoutineDetail(
  actor: PortalActor,
  routineId: string,
): Promise<SavedRoutineDetail | null> {
  if (
    actor.role !== "owner" ||
    !savedRoutinesEnabled() ||
    !z.string().uuid().safeParse(routineId).success
  ) {
    return null;
  }
  const [row] = await db
    .select({ routine: savedRoutines })
    .from(savedRoutines)
    .innerJoin(patients, eq(savedRoutines.patientId, patients.id))
    .where(
      and(
        eq(savedRoutines.id, routineId),
        eq(patients.ownerUserId, actor.id),
        isNull(savedRoutines.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  if (!(await verifySavedRoutinePlanHash(row.routine.plan, row.routine.planHash))) return null;
  const parsedPlan = GeneratedSessionSchema.safeParse(row.routine.plan);
  if (!parsedPlan.success) return null;
  const plan = parsedPlan.data;
  const equipmentIds = [...new Set(plan.exercises.map((exercise) => exercise.equipmentId))];
  const provenanceRows = equipmentIds.length
    ? await db
        .select({
          externalId: equipment.externalId,
          manufacturer: equipment.manufacturer,
          model: equipment.model,
          sourceUrl: equipment.sourceUrl,
        })
        .from(equipment)
        .where(inArray(equipment.externalId, equipmentIds))
    : [];
  const provenance = new Map(provenanceRows.map((item) => [item.externalId, item]));

  return {
    id: row.routine.id,
    title: row.routine.title,
    goal: plan.goal,
    savedAt: row.routine.savedAt.toISOString(),
    templateId: row.routine.templateId,
    templateVersion: row.routine.templateVersion,
    catalogVersion: row.routine.catalogVersion,
    createdVia: row.routine.createdVia === "webmcp" ? "webmcp" : "site-ui",
    generationMode: plan.generationMode,
    durationMinutes: plan.durationMinutes,
    exercises: plan.exercises.map((exercise) => {
      const source = provenance.get(exercise.equipmentId);
      return {
        ...exercise,
        manufacturer: source?.manufacturer ?? "Verified Gym catalog",
        model: source?.model ?? exercise.name,
        sourceUrl: source?.sourceUrl ?? null,
      };
    }),
    warmup: plan.warmup,
    cooldown: plan.cooldown,
    safetyNotes: plan.safetyNotes,
    requiresExpertReview: plan.requiresExpertReview,
    ...(plan.expertReviewReason ? { expertReviewReason: plan.expertReviewReason } : {}),
    decisionTrace: plan.decisionTrace,
    synthetic: true,
  };
}
