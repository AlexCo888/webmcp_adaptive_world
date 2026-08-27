export const AUDIT_ACTIONS = [
  "access_grant.created",
  "access_grant.revoked",
  "context_grant.created",
  "context_grant.redeemed",
  "context_grant.revoked",
  "document.opened",
  "passport.section_viewed",
  "clinical_guidance.created",
  "gym.session_created",
  "gym.feedback_recorded",
  "authorization.denied",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEvent {
  id?: string;
  occurredAt: string;
  actorUserId: string | null;
  patientId: string | null;
  action: AuditAction;
  resourceType: string;
  resourceId: string | null;
  outcome: "success" | "denied" | "error";
  requestId: string | null;
  ipHash: string | null;
  userAgent: string | null;
  /** Metadata must never contain tokens, document contents, labs, or secrets. */
  metadata: Record<string, string | number | boolean | null>;
}

const FORBIDDEN_AUDIT_KEYS =
  /token|secret|password|document|lab|medication|projection|content|body/iu;

export function sanitizeAuditMetadata(metadata: Record<string, unknown>): AuditEvent["metadata"] {
  const output: AuditEvent["metadata"] = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (FORBIDDEN_AUDIT_KEYS.test(key)) continue;
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      output[key] = typeof value === "string" ? value.slice(0, 256) : value;
    }
  }
  return output;
}
