import type { PassportScope } from "@adaptive-world/contracts";

export const PASSPORT_SCOPES = [
  "passport.summary.read",
  "passport.clinical.read",
  "passport.documents.read",
  "passport.guidance.write",
  "gym.context.create",
  "gym.context.read",
  "gym.feedback.write",
] as const satisfies readonly PassportScope[];

export type { PassportScope } from "@adaptive-world/contracts";

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor(message = "The active grant does not authorize this operation") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function hasScopes(granted: readonly string[], required: readonly PassportScope[]): boolean {
  const grantSet = new Set(granted);
  return required.every((scope) => grantSet.has(scope));
}

export function requireScopes(
  granted: readonly string[],
  required: readonly PassportScope[],
): void {
  if (!hasScopes(granted, required)) {
    throw new AuthorizationError();
  }
}

export interface GrantState {
  scopes: readonly string[];
  expiresAt: Date;
  revokedAt?: Date | null;
}

export function authorizeGrant(
  grant: GrantState,
  required: readonly PassportScope[],
  now = new Date(),
): void {
  if (grant.revokedAt || grant.expiresAt.getTime() <= now.getTime()) {
    throw new AuthorizationError("The access grant is expired or revoked");
  }
  requireScopes(grant.scopes, required);
}
