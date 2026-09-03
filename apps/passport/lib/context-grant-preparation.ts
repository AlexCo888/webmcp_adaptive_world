import {
  DigitalPassportSchema,
  GymContextProjectionSchema,
  RoutineGoalSchema,
  type DigitalPassport,
} from "@adaptive-world/contracts";
import {
  buildGymProjection,
  canonicalizeJson,
  constantTimeEqualHex,
  sha256Hex,
  signDemoToken,
  verifyDemoToken,
  type GymProjection,
} from "@adaptive-world/security";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  GYM_PROJECTION_REFERENCE,
  GymContextGrantDisclosureSchema,
  PreparedGymContextGrantResponseSchema,
  type PreparedGymContextGrant,
} from "./context-grant-contract";
import { GYM_CONTEXT_SCOPES, gymContextPurpose, gymProjectionInput } from "./gym-projection";
import { parsePersistedDigitalPassport } from "./persisted-passport";

const PREPARATION_ISSUER = "adaptive-world-passport";
const PREPARATION_AUDIENCE = "adaptive-world-context-grant";
const PREPARATION_TYPE = "gym-context-grant-preparation";

type SqlRow = Record<string, unknown>;

export type ContextGrantLockExecutor = (query: SQL) => Promise<{ rows: SqlRow[] }>;

export type LockedGymContextGrantPreparation =
  | { kind: "not_found" }
  | { kind: "invalid_preparation" }
  | {
      kind: "ready";
      patientId: string;
      timing: ReturnType<typeof resolveContextGrantTiming>;
      profile: GymProjection;
      purpose: string;
    };

const PreparationClaimsSchema = z
  .object({
    expiresInMinutes: z.number().int().min(1).max(20),
    issuedAt: z.string().datetime({ offset: true }),
    expiresAt: z.string().datetime({ offset: true }),
    projectionDigest: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

export function resolveContextGrantTiming(expiresInMinutes: number, issuedAt = new Date()) {
  const ttlMs = expiresInMinutes * 60_000;
  return {
    issuedAt,
    ttlMs,
    expiresAt: new Date(issuedAt.getTime() + ttlMs),
  };
}

/**
 * Locks the patient serialization row before reading the authoritative Passport
 * profile and validating any prepared disclosure. Call this from the same
 * transaction that inserts the context grant and audit event.
 */
export async function prepareLockedGymContextGrant(
  input: {
    actorId: string;
    requestedRoutineGoal: string;
    expiresInMinutes: number;
    preparationToken?: string;
  },
  execute: ContextGrantLockExecutor,
): Promise<LockedGymContextGrantPreparation> {
  const result = await execute(sql`
    SELECT patient_row.id, patient_row.profile
    FROM patients AS patient_row
    WHERE patient_row.owner_user_id = ${input.actorId}::uuid
    LIMIT 1
    FOR UPDATE OF patient_row
  `);
  const lockedRow = result.rows[0];
  if (!lockedRow) return { kind: "not_found" };
  const lockedPatient = z.object({ id: z.string().uuid(), profile: z.unknown() }).parse(lockedRow);

  const passport = parsePersistedDigitalPassport(lockedPatient.profile);
  const requestedRoutineGoal = RoutineGoalSchema.parse(input.requestedRoutineGoal);
  const verifiedPreparation = input.preparationToken
    ? await verifyPreparedGymContextGrant({
        passport,
        actorId: input.actorId,
        requestedRoutineGoal,
        expiresInMinutes: input.expiresInMinutes,
        preparationToken: input.preparationToken,
      })
    : null;
  if (input.preparationToken && !verifiedPreparation) {
    return { kind: "invalid_preparation" };
  }

  const timing = verifiedPreparation?.timing ?? resolveContextGrantTiming(input.expiresInMinutes);
  const profile =
    verifiedPreparation?.profile ??
    buildGymProjection(gymProjectionInput(passport, requestedRoutineGoal), {
      now: timing.issuedAt,
      validityMs: timing.ttlMs,
    });
  return {
    kind: "ready",
    patientId: lockedPatient.id,
    timing,
    profile,
    purpose: verifiedPreparation?.purpose ?? gymContextPurpose(requestedRoutineGoal),
  };
}

function publicDisclosure(profile: GymProjection) {
  const preferred = profile.preferredSessionMinutes;
  const projection = GymContextProjectionSchema.parse({
    projectionId: "gym_projection_pending",
    subjectAlias: "Passport member",
    purpose: profile.purpose,
    requestedRoutineGoal: profile.requestedRoutineGoal,
    goals: profile.goals ?? [],
    experienceLevel: profile.experienceLevel,
    preferredSessionMinutes: preferred ? Math.round((preferred.min + preferred.max) / 2) : 45,
    preferredActivities: profile.preferredActivities ?? [],
    functionalCapabilities: profile.functionalCapabilities ?? [],
    movementConsiderations: profile.movementConsiderations ?? [],
    avoid: profile.avoid ?? [],
    stopSignals: profile.stopSignals ?? [],
    accessibilityNeeds: profile.accessibilityNeeds ?? [],
    sourceCategories: profile.sourceCategories ?? [],
    issuedAt: profile.generatedAt,
    expiresAt: profile.validUntil,
    synthetic: true,
  });
  const { projectionId: _projectionId, ...disclosure } = projection;
  void _projectionId;
  return GymContextGrantDisclosureSchema.parse({
    ...disclosure,
    projectionReference: GYM_PROJECTION_REFERENCE,
  });
}

async function projectionDigest(profile: GymProjection, purpose: string): Promise<string> {
  return sha256Hex(
    canonicalizeJson({
      audience: "adaptive-gym",
      purpose,
      scopes: GYM_CONTEXT_SCOPES,
      profile,
    }),
  );
}

function buildPreparedProjection(
  passport: DigitalPassport,
  requestedRoutineGoal: string,
  expiresInMinutes: number,
  issuedAt: Date,
) {
  const goal = RoutineGoalSchema.parse(requestedRoutineGoal);
  const timing = resolveContextGrantTiming(expiresInMinutes, issuedAt);
  const profile = buildGymProjection(gymProjectionInput(passport, goal), {
    now: timing.issuedAt,
    validityMs: timing.ttlMs,
  });
  if (profile.validUntil !== timing.expiresAt.toISOString()) {
    throw new Error("Context grant preparation expiry invariant failed");
  }
  return {
    timing,
    profile,
    purpose: gymContextPurpose(goal),
    projection: publicDisclosure(profile),
  };
}

export async function prepareGymContextGrant({
  passport,
  actorId,
  requestedRoutineGoal,
  expiresInMinutes,
  now = new Date(),
}: {
  passport: DigitalPassport;
  actorId: string;
  requestedRoutineGoal: string;
  expiresInMinutes: number;
  now?: Date;
}): Promise<PreparedGymContextGrant> {
  const parsedPassport = DigitalPassportSchema.parse(passport);
  const prepared = buildPreparedProjection(
    parsedPassport,
    requestedRoutineGoal,
    expiresInMinutes,
    now,
  );
  const digest = await projectionDigest(prepared.profile, prepared.purpose);
  const preparationToken = await signDemoToken({
    issuer: PREPARATION_ISSUER,
    audience: PREPARATION_AUDIENCE,
    subject: actorId,
    type: PREPARATION_TYPE,
    ttlSeconds: expiresInMinutes * 60,
    now: prepared.timing.issuedAt,
    data: {
      expiresInMinutes,
      issuedAt: prepared.timing.issuedAt.toISOString(),
      expiresAt: prepared.timing.expiresAt.toISOString(),
      projectionDigest: digest,
    },
  });
  return PreparedGymContextGrantResponseSchema.parse({
    audience: "adaptive-gym",
    scopes: GYM_CONTEXT_SCOPES,
    purpose: prepared.purpose,
    projection: prepared.projection,
    preparationToken,
    quoteDigest: digest,
  });
}

export async function verifyPreparedGymContextGrant({
  passport,
  actorId,
  requestedRoutineGoal,
  expiresInMinutes,
  preparationToken,
  now = new Date(),
}: {
  passport: DigitalPassport;
  actorId: string;
  requestedRoutineGoal: string;
  expiresInMinutes: number;
  preparationToken: string;
  now?: Date;
}) {
  const claims = await verifyDemoToken<Record<string, unknown>>(preparationToken, {
    issuer: PREPARATION_ISSUER,
    audience: PREPARATION_AUDIENCE,
    type: PREPARATION_TYPE,
    now,
  });
  if (!claims || claims.sub !== actorId) return null;
  const parsed = PreparationClaimsSchema.safeParse(claims.data);
  if (!parsed.success || parsed.data.expiresInMinutes !== expiresInMinutes) return null;
  const issuedAt = new Date(parsed.data.issuedAt);
  const prepared = buildPreparedProjection(
    DigitalPassportSchema.parse(passport),
    requestedRoutineGoal,
    expiresInMinutes,
    issuedAt,
  );
  if (prepared.timing.expiresAt.toISOString() !== parsed.data.expiresAt) return null;
  const digest = await projectionDigest(prepared.profile, prepared.purpose);
  if (!constantTimeEqualHex(digest, parsed.data.projectionDigest)) return null;
  return prepared;
}
