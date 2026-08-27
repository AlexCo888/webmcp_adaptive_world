import { z } from "zod";

export const IdSchema = z
  .string()
  .min(3)
  .max(96)
  .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use lowercase stable identifiers");

export const SlugSchema = z
  .string()
  .min(2)
  .max(96)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const IsoDateSchema = z.string().date();
export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const LocaleSchema = z.enum(["en-US", "es-MX"]);

export const SensitivitySchema = z.enum(["public", "personal", "sensitive", "restricted-health"]);

export const SourceReferenceSchema = z.object({
  id: IdSchema,
  kind: z.enum(["self-reported", "clinician", "laboratory", "device", "manufacturer"]),
  label: z.string().min(1).max(160),
  recordedAt: IsoDateTimeSchema,
  synthetic: z.boolean().default(true),
});

export type SourceReference = z.infer<typeof SourceReferenceSchema>;
