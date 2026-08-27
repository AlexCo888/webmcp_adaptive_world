import { z } from "zod";

import {
  IdSchema,
  IsoDateSchema,
  IsoDateTimeSchema,
  LocaleSchema,
  SensitivitySchema,
  SourceReferenceSchema,
} from "./common";

export const BiologicalSexSchema = z.enum(["female", "male", "intersex", "unknown"]);

export const IdentitySchema = z.object({
  displayName: z.string().min(1).max(100),
  dateOfBirth: IsoDateSchema,
  biologicalSex: BiologicalSexSchema,
  pronouns: z.string().min(1).max(40).optional(),
  locale: LocaleSchema,
});

export const MeasurementSchema = z.object({
  code: IdSchema,
  label: z.string().min(1).max(120),
  value: z.number().finite(),
  unit: z.string().min(1).max(24),
  observedAt: IsoDateTimeSchema,
  interpretation: z.enum(["low", "normal", "high", "informational"]).optional(),
  referenceRange: z
    .object({
      low: z.number().finite().optional(),
      high: z.number().finite().optional(),
      text: z.string().max(100).optional(),
    })
    .optional(),
  sourceId: IdSchema,
});

export const HealthConditionSchema = z.object({
  id: IdSchema,
  label: z.string().min(1).max(140),
  status: z.enum(["active", "controlled", "resolved", "monitoring"]),
  severity: z.enum(["mild", "moderate", "severe"]).optional(),
  onsetYear: z.number().int().min(1900).max(2100).optional(),
  notes: z.string().max(400).optional(),
  sourceId: IdSchema,
});

export const MedicationSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(100),
  dose: z.string().min(1).max(80),
  schedule: z.string().min(1).max(120),
  status: z.enum(["active", "stopped"]),
  sourceId: IdSchema,
});

export const AllergySchema = z.object({
  id: IdSchema,
  substance: z.string().min(1).max(100),
  reaction: z.string().min(1).max(160),
  severity: z.enum(["mild", "moderate", "severe"]),
  status: z.enum(["active", "resolved"]),
  sourceId: IdSchema,
});

export const FunctionalProfileSchema = z.object({
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]),
  weeklyActivityMinutes: z.number().int().min(0).max(2000),
  preferredSessionMinutes: z.number().int().min(10).max(180),
  goals: z.array(z.string().min(2).max(100)).min(1).max(8),
  preferredActivities: z.array(z.string().min(2).max(100)).max(12),
  movementConsiderations: z.array(z.string().min(2).max(180)).max(12),
  stopSignals: z.array(z.string().min(2).max(180)).max(10),
  accessibilityNeeds: z.array(z.string().min(2).max(180)).max(10),
});

export const ClinicalDocumentSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(180),
  kind: z.enum([
    "lab-report",
    "imaging",
    "clinical-summary",
    "functional-assessment",
    "care-guidance",
  ]),
  issuedAt: IsoDateTimeSchema,
  sensitivity: SensitivitySchema,
  sourceId: IdSchema,
  synthetic: z.literal(true),
});

export const DigitalPassportSchema = z
  .object({
    id: IdSchema,
    version: z.literal("1.0"),
    synthetic: z.literal(true),
    identity: IdentitySchema,
    heightCm: z.number().min(80).max(250),
    weightKg: z.number().min(20).max(400),
    vitalSigns: z.array(MeasurementSchema).max(20),
    conditions: z.array(HealthConditionSchema).max(30),
    medications: z.array(MedicationSchema).max(30),
    allergies: z.array(AllergySchema).max(30),
    notableResults: z.array(MeasurementSchema).max(30),
    functional: FunctionalProfileSchema,
    documents: z.array(ClinicalDocumentSchema).min(1).max(40),
    sources: z.array(SourceReferenceSchema).min(1).max(40),
    updatedAt: IsoDateTimeSchema,
  })
  .superRefine((passport, ctx) => {
    const sourceIds = new Set(passport.sources.map((source) => source.id));
    const referencedSourceIds = [
      ...passport.vitalSigns.map((item) => item.sourceId),
      ...passport.conditions.map((item) => item.sourceId),
      ...passport.medications.map((item) => item.sourceId),
      ...passport.allergies.map((item) => item.sourceId),
      ...passport.notableResults.map((item) => item.sourceId),
      ...passport.documents.map((item) => item.sourceId),
    ];

    for (const sourceId of referencedSourceIds) {
      if (!sourceIds.has(sourceId)) {
        ctx.addIssue({
          code: "custom",
          message: `Unknown sourceId: ${sourceId}`,
          path: ["sources"],
        });
      }
    }
  });

export const GymContextProjectionSchema = z.object({
  projectionId: IdSchema,
  subjectAlias: z.string().min(1).max(80),
  ageBand: z.enum(["18-29", "30-44", "45-64", "65+"]),
  goals: z.array(z.string().min(2).max(100)).min(1).max(8),
  experienceLevel: FunctionalProfileSchema.shape.experienceLevel,
  preferredSessionMinutes: FunctionalProfileSchema.shape.preferredSessionMinutes,
  preferredActivities: z.array(z.string().min(2).max(100)).max(12),
  movementConsiderations: z.array(z.string().min(2).max(180)).max(12),
  stopSignals: z.array(z.string().min(2).max(180)).max(10),
  accessibilityNeeds: z.array(z.string().min(2).max(180)).max(10),
  issuedAt: IsoDateTimeSchema,
  expiresAt: IsoDateTimeSchema,
  synthetic: z.literal(true),
});

export type DigitalPassport = z.infer<typeof DigitalPassportSchema>;
export type GymContextProjection = z.infer<typeof GymContextProjectionSchema>;
export type FunctionalProfile = z.infer<typeof FunctionalProfileSchema>;
