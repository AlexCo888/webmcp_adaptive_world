import { z } from "zod";

import { IdSchema, IsoDateTimeSchema } from "./common";

export const PassportScopeSchema = z.enum([
  "passport.summary.read",
  "passport.clinical.read",
  "passport.documents.read",
  "passport.guidance.write",
  "gym.context.create",
  "gym.context.read",
  "gym.feedback.write",
]);

export const AccessGrantSchema = z
  .object({
    id: IdSchema,
    passportId: IdSchema,
    granteeId: IdSchema,
    granteeType: z.enum(["clinician", "organization", "application"]),
    scopes: z.array(PassportScopeSchema).min(1),
    status: z.enum(["active", "revoked", "expired"]),
    purpose: z.string().min(3).max(240),
    issuedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    revokedAt: IsoDateTimeSchema.optional(),
  })
  .superRefine((grant, ctx) => {
    if (grant.status === "revoked" && !grant.revokedAt) {
      ctx.addIssue({ code: "custom", message: "revokedAt is required", path: ["revokedAt"] });
    }
  });

export const AuditEventSchema = z.object({
  id: IdSchema,
  actorId: IdSchema,
  action: z.string().min(2).max(120),
  resourceType: z.enum(["passport", "document", "grant", "context", "feedback"]),
  resourceId: IdSchema,
  purpose: z.string().min(2).max(240),
  outcome: z.enum(["allowed", "denied", "confirmed", "failed"]),
  createdAt: IsoDateTimeSchema,
});

export type PassportScope = z.infer<typeof PassportScopeSchema>;
export type AccessGrant = z.infer<typeof AccessGrantSchema>;
export type AuditEvent = z.infer<typeof AuditEventSchema>;
