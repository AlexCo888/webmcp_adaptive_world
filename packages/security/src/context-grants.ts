import type { PassportScope } from "./scopes";
import { createOpaqueToken, hashOpaqueToken } from "./tokens";
import { assertSafeGymProjection } from "./gym-projection";

export interface ContextProjection {
  version: 1;
  profile: object;
  validUntil: string;
}

export interface StoredContextGrant {
  id: string;
  tokenHash: string;
  patientId: string;
  createdByUserId: string;
  audience: string;
  purpose: string;
  scopes: readonly PassportScope[];
  projection: ContextProjection;
  createdAt: Date;
  expiresAt: Date;
  redeemedAt: Date | null;
  revokedAt: Date | null;
}

export type NewStoredContextGrant = Omit<StoredContextGrant, "id" | "redeemedAt" | "revokedAt">;

/**
 * Implementations must make consume() atomic (UPDATE ... WHERE redeemed_at IS
 * NULL AND revoked_at IS NULL AND expires_at > now RETURNING ...). A read then
 * write sequence is not safe.
 */
export interface ContextGrantStore {
  create(input: NewStoredContextGrant): Promise<StoredContextGrant>;
  consume(
    tokenHash: string,
    expectedAudience: string,
    now: Date,
  ): Promise<StoredContextGrant | null>;
  revoke(grantId: string, actorUserId: string, now: Date): Promise<boolean>;
}

export interface IssueContextGrantInput {
  patientId: string;
  createdByUserId: string;
  audience: string;
  purpose: string;
  scopes: readonly PassportScope[];
  projection: ContextProjection;
  ttlMs?: number;
  now?: Date;
}

export interface IssuedContextGrant {
  id: string;
  /** The plaintext token is returned once and must never be persisted or logged. */
  token: string;
  expiresAt: Date;
}

const DEFAULT_TTL_MS = 20 * 60 * 1_000;
const MAX_TTL_MS = 20 * 60 * 1_000;

export async function issueContextGrant(
  store: ContextGrantStore,
  input: IssueContextGrantInput,
): Promise<IssuedContextGrant> {
  const ttlMs = input.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > MAX_TTL_MS) {
    throw new RangeError("Context grant TTL must be between 1 ms and 20 minutes");
  }

  if (/gym/iu.test(input.audience)) {
    assertSafeGymProjection(input.projection.profile);
  }

  const now = input.now ?? new Date();
  const token = createOpaqueToken();
  const grant = await store.create({
    tokenHash: await hashOpaqueToken(token),
    patientId: input.patientId,
    createdByUserId: input.createdByUserId,
    audience: input.audience,
    purpose: input.purpose,
    scopes: [...input.scopes],
    projection: input.projection,
    createdAt: now,
    expiresAt: new Date(now.getTime() + ttlMs),
  });

  return { id: grant.id, token, expiresAt: grant.expiresAt };
}

export async function redeemContextGrant(
  store: ContextGrantStore,
  token: string,
  expectedAudience: string,
  now = new Date(),
): Promise<StoredContextGrant | null> {
  if (!expectedAudience.trim()) throw new TypeError("Expected audience is required");
  return store.consume(await hashOpaqueToken(token), expectedAudience, now);
}

export async function revokeContextGrant(
  store: ContextGrantStore,
  grantId: string,
  actorUserId: string,
  now = new Date(),
): Promise<boolean> {
  return store.revoke(grantId, actorUserId, now);
}
