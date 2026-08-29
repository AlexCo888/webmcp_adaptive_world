import { createHash } from "node:crypto";

function scopedDigest(scope: string, internalId: string): string {
  return createHash("sha256").update(`${scope}:${internalId}`).digest("hex").slice(0, 24);
}

export function toPublicGymProjectionId(internalSessionId: string): string {
  return `gym_projection_${scopedDigest("projection", internalSessionId)}`;
}

export function toPublicGymRoutineId(internalSessionId: string): string {
  return `gym_routine_${scopedDigest("routine", internalSessionId)}`;
}
