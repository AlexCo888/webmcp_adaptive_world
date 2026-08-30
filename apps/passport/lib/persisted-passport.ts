import { DigitalPassportSchema, type DigitalPassport } from "@adaptive-world/contracts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Passport profiles seeded before functional provenance was introduced do not
 * have a sourceCategory. Those legacy synthetic preferences were self-reported,
 * so adapt only the missing field and leave every explicit value to the strict
 * canonical schema.
 */
export function parsePersistedDigitalPassport(profile: unknown): DigitalPassport {
  if (!isRecord(profile) || profile.synthetic !== true || !isRecord(profile.functional)) {
    return DigitalPassportSchema.parse(profile);
  }
  if ("sourceCategory" in profile.functional) {
    return DigitalPassportSchema.parse(profile);
  }
  return DigitalPassportSchema.parse({
    ...profile,
    functional: {
      ...profile.functional,
      sourceCategory: "self_reported",
    },
  });
}
