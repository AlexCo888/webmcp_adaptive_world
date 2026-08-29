import { z } from "zod";

import { IdSchema, SlugSchema } from "./common";

export const EquipmentCategorySchema = z.enum([
  "cardio",
  "selectorized-strength",
  "plate-loaded-strength",
  "free-weights",
  "functional-training",
  "pilates-mobility",
  "rehabilitation",
]);

export const EquipmentSchema = z.object({
  id: IdSchema,
  slug: SlugSchema,
  name: z.string().min(2).max(120),
  manufacturer: z.string().min(2).max(100),
  model: z.string().min(1).max(100),
  category: EquipmentCategorySchema,
  summary: z.string().min(20).max(400),
  dimensionsCm: z.object({
    length: z.number().positive().max(1000),
    width: z.number().positive().max(1000),
    height: z.number().positive().max(500),
  }),
  requiredClearanceCm: z.number().min(0).max(300),
  maxUserWeightKg: z.number().positive().max(500).optional(),
  power: z.enum(["none", "120v", "220v", "self-powered"]),
  stations: z.number().int().positive().max(12).default(1),
  capabilities: z.array(z.string().min(2).max(100)).min(1).max(12),
  accessibility: z.array(z.string().min(2).max(140)).max(10),
  suitabilityTags: z.array(z.string().min(2).max(60)).min(1).max(12),
  locationZone: z.string().min(2).max(60),
  available: z.boolean(),
  verifiedProduct: z.literal(true),
  syntheticFacilityInventory: z.literal(true),
  sourceUrl: z.string().url(),
  sourceLabel: z.string().min(2).max(120),
  sourceCheckedAt: z.string().date(),
  imageUrl: z
    .string()
    .regex(
      /^\/images\/equipment\/[a-z0-9]+(?:-[a-z0-9]+)*\.svg$/u,
      "Equipment artwork must be a project-owned local SVG",
    ),
  imageAlt: z.string().min(5).max(180),
});

export const EquipmentCatalogSchema = z.array(EquipmentSchema).length(12);

export const SessionExerciseSchema = z.object({
  equipmentId: IdSchema,
  name: z.string().min(2).max(120),
  durationMinutes: z.number().int().min(1).max(90).optional(),
  sets: z.number().int().min(1).max(12).optional(),
  reps: z.string().min(1).max(40).optional(),
  intensity: z.enum(["easy", "moderate", "challenging"]),
  instructions: z.array(z.string().min(2).max(220)).min(1).max(6),
  adaptationReason: z.string().min(3).max(240),
});

export const GeneratedSessionSchema = z.object({
  id: IdSchema,
  projectionId: IdSchema,
  title: z.string().min(2).max(120),
  goal: z.string().min(2).max(160),
  templateId: IdSchema,
  templateVersion: z.string().min(1).max(24),
  createdVia: z.enum(["site-ui", "webmcp"]),
  catalogVersion: z.string().min(1).max(40),
  durationMinutes: z.number().int().min(10).max(180),
  status: z.enum(["draft", "confirmed", "completed", "cancelled"]),
  exercises: z.array(SessionExerciseSchema).min(1).max(20),
  safetyNotes: z.array(z.string().min(2).max(200)).max(8),
  decisionTrace: z.array(z.string().min(3).max(240)).min(2).max(12),
  createdAt: z.string().datetime({ offset: true }),
});

export const SessionFeedbackSchema = z.object({
  sessionId: IdSchema,
  perceivedEffort: z.number().int().min(1).max(10),
  painDuringSession: z.number().int().min(0).max(10),
  completedExerciseIds: z.array(IdSchema).max(20),
  notes: z.string().max(600).optional(),
  submittedAt: z.string().datetime({ offset: true }),
});

export type Equipment = z.infer<typeof EquipmentSchema>;
export type EquipmentCategory = z.infer<typeof EquipmentCategorySchema>;
export type GeneratedSession = z.infer<typeof GeneratedSessionSchema>;
export type SessionFeedback = z.infer<typeof SessionFeedbackSchema>;
