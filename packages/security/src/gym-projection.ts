export interface GymProjectionInput {
  ageBand?: string;
  goals?: readonly string[];
  experienceLevel?: string;
  preferredActivities?: readonly string[];
  preferredSessionMinutes?: { min: number; max: number };
  functionalCapabilities?: readonly string[];
  movementConsiderations?: readonly string[];
  avoid?: readonly string[];
  stopSignals?: readonly string[];
  accessibilityNeeds?: readonly string[];
  sourceCategories?: readonly ("self_reported" | "clinician_guidance")[];
}

export interface GymProjection extends GymProjectionInput {
  version: 1;
  purpose: "adaptive_gym_session";
  generatedAt: string;
  validUntil: string;
}

const ALLOWED_KEYS = new Set([
  "version",
  "purpose",
  "generatedAt",
  "validUntil",
  "ageBand",
  "goals",
  "experienceLevel",
  "preferredActivities",
  "preferredSessionMinutes",
  "functionalCapabilities",
  "movementConsiderations",
  "avoid",
  "stopSignals",
  "accessibilityNeeds",
  "sourceCategories",
]);

const SENSITIVE_TERMS = [
  "fullname",
  "firstname",
  "lastname",
  "email",
  "phone",
  "address",
  "birth",
  "dob",
  "identity",
  "patientid",
  "passportid",
  "userid",
  "medication",
  "prescriptiondrug",
  "labresult",
  "laboratory",
  "diagnosis",
  "document",
  "doctor",
  "emergencycontact",
  "allergy",
] as const;

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/gu, "");
  return SENSITIVE_TERMS.some((term) => normalized.includes(term));
}

function cleanStrings(values: readonly string[] | undefined): string[] | undefined {
  if (!values) return undefined;
  return values
    .map((value) => value.trim().slice(0, 240))
    .filter(Boolean)
    .slice(0, 30);
}

export function buildGymProjection(
  input: GymProjectionInput,
  options: { now?: Date; validityMs?: number } = {},
): GymProjection {
  const now = options.now ?? new Date();
  const validityMs = options.validityMs ?? 24 * 60 * 60 * 1_000;
  if (validityMs <= 0 || validityMs > 7 * 24 * 60 * 60 * 1_000) {
    throw new RangeError("Gym projections may be valid for at most seven days");
  }

  const output: GymProjection = {
    version: 1,
    purpose: "adaptive_gym_session",
    generatedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + validityMs).toISOString(),
    ageBand: input.ageBand?.slice(0, 32),
    goals: cleanStrings(input.goals),
    experienceLevel: input.experienceLevel?.slice(0, 64),
    preferredActivities: cleanStrings(input.preferredActivities),
    preferredSessionMinutes: input.preferredSessionMinutes,
    functionalCapabilities: cleanStrings(input.functionalCapabilities),
    movementConsiderations: cleanStrings(input.movementConsiderations),
    avoid: cleanStrings(input.avoid),
    stopSignals: cleanStrings(input.stopSignals),
    accessibilityNeeds: cleanStrings(input.accessibilityNeeds),
    sourceCategories: input.sourceCategories ? [...input.sourceCategories] : undefined,
  };
  assertSafeGymProjection(output);
  return output;
}

export function assertSafeGymProjection(value: unknown): asserts value is GymProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Gym projection must be an object");
  }
  const visit = (item: unknown, path: string): void => {
    if (!item || typeof item !== "object") return;
    if (Array.isArray(item)) {
      item.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        throw new TypeError(`Sensitive field is forbidden in gym projection: ${path}${key}`);
      }
      visit(child, `${path}${key}.`);
    }
  };
  visit(value, "");
  for (const key of Object.keys(value)) {
    if (!ALLOWED_KEYS.has(key)) throw new TypeError(`Unknown gym projection field: ${key}`);
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || candidate.purpose !== "adaptive_gym_session") {
    throw new TypeError("Gym projection version or purpose is invalid");
  }
  if (
    typeof candidate.generatedAt !== "string" ||
    typeof candidate.validUntil !== "string" ||
    !Number.isFinite(Date.parse(candidate.generatedAt)) ||
    !Number.isFinite(Date.parse(candidate.validUntil))
  ) {
    throw new TypeError("Gym projection timestamps are invalid");
  }
  if (Date.parse(candidate.validUntil) <= Date.parse(candidate.generatedAt)) {
    throw new TypeError("Gym projection must expire after it is generated");
  }
  if (candidate.preferredSessionMinutes !== undefined) {
    const minutes = candidate.preferredSessionMinutes as Record<string, unknown>;
    if (
      typeof minutes.min !== "number" ||
      typeof minutes.max !== "number" ||
      minutes.min < 1 ||
      minutes.max > 240 ||
      minutes.min > minutes.max
    ) {
      throw new TypeError("Preferred session duration is invalid");
    }
  }
}

export function redactSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitiveFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isSensitiveKey(key))
      .map(([key, child]) => [key, redactSensitiveFields(child)]),
  );
}
