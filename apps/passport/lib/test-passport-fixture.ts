import { DigitalPassportSchema } from "@adaptive-world/contracts";

const observedAt = "2026-08-20T18:00:00.000Z";

export const testPassport = DigitalPassportSchema.parse({
  id: "passport_test",
  version: "1.0",
  synthetic: true,
  identity: {
    displayName: "Test Person",
    dateOfBirth: "2001-04-12",
    biologicalSex: "unknown",
    locale: "en-US",
  },
  heightCm: 175,
  weightKg: 72,
  vitalSigns: [
    {
      code: "systolic_bp",
      label: "Systolic blood pressure",
      value: 118,
      unit: "mmHg",
      observedAt,
      interpretation: "normal",
      referenceRange: { low: 90, high: 120 },
      sourceId: "source_test",
    },
  ],
  conditions: [
    {
      id: "condition_test",
      label: "Test condition",
      status: "monitoring",
      notes: "Private clinical narrative",
      sourceId: "source_test",
    },
  ],
  medications: [
    {
      id: "medication_test",
      name: "Test medication",
      dose: "1 unit",
      schedule: "Daily",
      status: "active",
      sourceId: "source_test",
    },
  ],
  allergies: [
    {
      id: "allergy_test",
      substance: "Test allergen",
      reaction: "Test reaction",
      severity: "mild",
      status: "active",
      sourceId: "source_test",
    },
  ],
  notableResults: [
    {
      code: "result_test",
      label: "Private notable result",
      value: 42,
      unit: "unit",
      observedAt,
      interpretation: "high",
      referenceRange: { high: 40 },
      sourceId: "source_test",
    },
  ],
  functional: {
    sourceCategory: "clinician_guidance",
    experienceLevel: "beginner",
    weeklyActivityMinutes: 120,
    preferredSessionMinutes: 30,
    goals: ["Build strength"],
    preferredActivities: ["Cycling"],
    movementConsiderations: ["Use a gradual warm-up"],
    stopSignals: ["Stop for dizziness"],
    accessibilityNeeds: ["Clear routes"],
  },
  documents: [
    {
      id: "document_test",
      title: "Test clinical source",
      kind: "clinical-summary",
      issuedAt: observedAt,
      sensitivity: "restricted-health",
      sourceId: "source_test",
      synthetic: true,
    },
  ],
  sources: [
    {
      id: "source_test",
      kind: "clinician",
      label: "Test clinic",
      recordedAt: observedAt,
      synthetic: true,
    },
  ],
  updatedAt: observedAt,
});
