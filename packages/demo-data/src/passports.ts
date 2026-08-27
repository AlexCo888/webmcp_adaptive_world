import {
  AccessGrantSchema,
  DigitalPassportSchema,
  GymContextProjectionSchema,
  type DigitalPassport,
  type FunctionalProfile,
} from "@adaptive-world/contracts";

const observedAt = "2026-08-18T14:30:00.000Z";
const updatedAt = "2026-08-20T18:00:00.000Z";

const sources = [
  {
    id: "self_report",
    kind: "self-reported" as const,
    label: "Synthetic participant intake",
    recordedAt: observedAt,
    synthetic: true,
  },
  {
    id: "demo_clinic",
    kind: "clinician" as const,
    label: "Adaptive World Demo Clinic",
    recordedAt: observedAt,
    synthetic: true,
  },
  {
    id: "demo_lab",
    kind: "laboratory" as const,
    label: "Adaptive World Synthetic Laboratory",
    recordedAt: observedAt,
    synthetic: true,
  },
];

type Seed = {
  id: string;
  displayName: string;
  dateOfBirth: string;
  biologicalSex: "female" | "male" | "intersex" | "unknown";
  pronouns: string;
  locale?: "en-US" | "es-MX";
  heightCm: number;
  weightKg: number;
  bloodPressure: string;
  restingHeartRate: number;
  conditions: Array<{
    id: string;
    label: string;
    status: "active" | "controlled" | "resolved" | "monitoring";
    severity?: "mild" | "moderate" | "severe";
    onsetYear?: number;
    notes?: string;
  }>;
  medications?: Array<{ id: string; name: string; dose: string; schedule: string }>;
  allergies?: Array<{
    id: string;
    substance: string;
    reaction: string;
    severity: "mild" | "moderate" | "severe";
  }>;
  results: Array<{
    code: string;
    label: string;
    value: number;
    unit: string;
    interpretation: "low" | "normal" | "high" | "informational";
    low?: number;
    high?: number;
  }>;
  functional: FunctionalProfile;
  documentTitles: Array<{
    title: string;
    kind: "lab-report" | "imaging" | "clinical-summary" | "functional-assessment" | "care-guidance";
  }>;
};

function buildPassport(seed: Seed): DigitalPassport {
  const [systolic = 120, diastolic = 80] = seed.bloodPressure.split("/").map(Number);

  return DigitalPassportSchema.parse({
    id: seed.id,
    version: "1.0",
    synthetic: true,
    identity: {
      displayName: seed.displayName,
      dateOfBirth: seed.dateOfBirth,
      biologicalSex: seed.biologicalSex,
      pronouns: seed.pronouns,
      locale: seed.locale ?? "en-US",
    },
    heightCm: seed.heightCm,
    weightKg: seed.weightKg,
    vitalSigns: [
      {
        code: "systolic_bp",
        label: "Systolic blood pressure",
        value: systolic,
        unit: "mmHg",
        observedAt,
        interpretation: systolic < 130 ? "normal" : "high",
        sourceId: "demo_clinic",
      },
      {
        code: "diastolic_bp",
        label: "Diastolic blood pressure",
        value: diastolic,
        unit: "mmHg",
        observedAt,
        interpretation: diastolic < 80 ? "normal" : "high",
        sourceId: "demo_clinic",
      },
      {
        code: "resting_hr",
        label: "Resting heart rate",
        value: seed.restingHeartRate,
        unit: "bpm",
        observedAt,
        interpretation: "informational",
        sourceId: "demo_clinic",
      },
    ],
    conditions: seed.conditions.map((condition) => ({
      ...condition,
      sourceId: "demo_clinic",
    })),
    medications: (seed.medications ?? []).map((medication) => ({
      ...medication,
      status: "active" as const,
      sourceId: "demo_clinic",
    })),
    allergies: (seed.allergies ?? []).map((allergy) => ({
      ...allergy,
      status: "active" as const,
      sourceId: "demo_clinic",
    })),
    notableResults: seed.results.map((result) => ({
      code: result.code,
      label: result.label,
      value: result.value,
      unit: result.unit,
      observedAt,
      interpretation: result.interpretation,
      referenceRange:
        result.low === undefined && result.high === undefined
          ? undefined
          : { low: result.low, high: result.high },
      sourceId: "demo_lab",
    })),
    functional: seed.functional,
    documents: seed.documentTitles.map((document, index) => ({
      id: `${seed.id}_doc_${String(index + 1).padStart(2, "0")}`,
      title: document.title,
      kind: document.kind,
      issuedAt: observedAt,
      sensitivity: "restricted-health" as const,
      sourceId: document.kind === "lab-report" ? "demo_lab" : "demo_clinic",
      synthetic: true as const,
    })),
    sources,
    updatedAt,
  });
}

const seeds: Seed[] = [
  {
    id: "passport_mateo",
    displayName: "Mateo Rivera Demo",
    dateOfBirth: "2001-04-12",
    biologicalSex: "male",
    pronouns: "he/him",
    locale: "es-MX",
    heightCm: 178,
    weightKg: 76.4,
    bloodPressure: "118/74",
    restingHeartRate: 58,
    conditions: [
      {
        id: "right_ankle_sprain",
        label: "Right ankle inversion sprain",
        status: "resolved",
        severity: "mild",
        onsetYear: 2022,
      },
      {
        id: "right_shoulder_tightness",
        label: "Occasional right shoulder tightness after overhead volume",
        status: "monitoring",
        severity: "mild",
      },
    ],
    results: [
      {
        code: "vitamin_d",
        label: "25-OH vitamin D",
        value: 18,
        unit: "ng/mL",
        interpretation: "low",
        low: 20,
      },
      {
        code: "ldl",
        label: "LDL cholesterol",
        value: 121,
        unit: "mg/dL",
        interpretation: "high",
        high: 100,
      },
      {
        code: "a1c",
        label: "Hemoglobin A1c",
        value: 5.2,
        unit: "%",
        interpretation: "normal",
        high: 5.6,
      },
    ],
    functional: {
      experienceLevel: "intermediate",
      weeklyActivityMinutes: 165,
      preferredSessionMinutes: 55,
      goals: ["Build whole-body strength", "Improve mobility", "Run 5 km comfortably"],
      preferredActivities: ["Free weights", "Incline walking", "Pilates", "Selectorized machines"],
      movementConsiderations: [
        "Keep overhead volume moderate",
        "Include ankle mobility in warm-up",
      ],
      stopSignals: ["Chest pain", "Fainting", "Sudden or escalating joint pain"],
      accessibilityNeeds: [],
    },
    documentTitles: [
      { title: "Digital Passport summary", kind: "clinical-summary" },
      { title: "Complete blood count", kind: "lab-report" },
      { title: "Comprehensive metabolic panel", kind: "lab-report" },
      { title: "Lipid panel", kind: "lab-report" },
      { title: "Hemoglobin A1c", kind: "lab-report" },
      { title: "Complete urinalysis", kind: "lab-report" },
      { title: "Supplemental micronutrient panel", kind: "lab-report" },
      { title: "Adaptive Gym guidance", kind: "care-guidance" },
    ],
  },
  {
    id: "passport_daniel",
    displayName: "Daniel Martínez Demo",
    dateOfBirth: "1981-01-27",
    biologicalSex: "male",
    pronouns: "he/him",
    locale: "es-MX",
    heightCm: 174,
    weightKg: 88.7,
    bloodPressure: "128/78",
    restingHeartRate: 72,
    conditions: [
      {
        id: "hypertension",
        label: "Essential hypertension",
        status: "controlled",
        severity: "mild",
        onsetYear: 2023,
      },
      {
        id: "prediabetes",
        label: "Prediabetes",
        status: "monitoring",
        severity: "mild",
        onsetYear: 2026,
      },
    ],
    medications: [{ id: "losartan", name: "Losartan", dose: "50 mg", schedule: "Once daily" }],
    results: [
      {
        code: "a1c",
        label: "Hemoglobin A1c",
        value: 5.9,
        unit: "%",
        interpretation: "high",
        high: 5.6,
      },
      {
        code: "ldl",
        label: "LDL cholesterol",
        value: 139,
        unit: "mg/dL",
        interpretation: "high",
        high: 100,
      },
      {
        code: "triglycerides",
        label: "Triglycerides",
        value: 181,
        unit: "mg/dL",
        interpretation: "high",
        high: 150,
      },
    ],
    functional: {
      experienceLevel: "beginner",
      weeklyActivityMinutes: 65,
      preferredSessionMinutes: 45,
      goals: [
        "Improve cardiometabolic fitness",
        "Build consistent exercise habits",
        "Increase strength",
      ],
      preferredActivities: ["Walking", "Recumbent cycling", "Selectorized machines"],
      movementConsiderations: [
        "Progress gradually",
        "Use moderate loads and steady breathing",
        "Avoid unsupervised maximal efforts",
      ],
      stopSignals: [
        "Chest pressure",
        "Unusual shortness of breath",
        "Dizziness",
        "Severe headache",
      ],
      accessibilityNeeds: [],
    },
    documentTitles: [
      { title: "Digital Passport summary", kind: "clinical-summary" },
      { title: "Complete blood count", kind: "lab-report" },
      { title: "Comprehensive metabolic panel", kind: "lab-report" },
      { title: "Lipid panel", kind: "lab-report" },
      { title: "Hemoglobin A1c", kind: "lab-report" },
      { title: "Urine albumin-to-creatinine ratio", kind: "lab-report" },
      { title: "Resting ECG summary", kind: "clinical-summary" },
      { title: "Adaptive Gym cardiometabolic guidance", kind: "care-guidance" },
    ],
  },
  {
    id: "passport_maya",
    displayName: "Maya Chen Demo",
    dateOfBirth: "1996-06-19",
    biologicalSex: "female",
    pronouns: "she/her",
    heightCm: 165,
    weightKg: 59.8,
    bloodPressure: "110/68",
    restingHeartRate: 54,
    conditions: [
      {
        id: "low_iron_stores",
        label: "Low iron stores without anemia",
        status: "monitoring",
        severity: "mild",
        onsetYear: 2026,
      },
      {
        id: "patellofemoral_pain",
        label: "Right patellofemoral pain",
        status: "active",
        severity: "mild",
        onsetYear: 2025,
      },
    ],
    results: [
      {
        code: "ferritin",
        label: "Ferritin",
        value: 13,
        unit: "ng/mL",
        interpretation: "low",
        low: 15,
      },
      {
        code: "hemoglobin",
        label: "Hemoglobin",
        value: 12.4,
        unit: "g/dL",
        interpretation: "normal",
        low: 12,
      },
      {
        code: "vitamin_b12",
        label: "Vitamin B12",
        value: 248,
        unit: "pg/mL",
        interpretation: "informational",
        low: 200,
      },
    ],
    functional: {
      experienceLevel: "advanced",
      weeklyActivityMinutes: 310,
      preferredSessionMinutes: 60,
      goals: [
        "Return to comfortable running",
        "Build hip and knee capacity",
        "Maintain aerobic fitness",
      ],
      preferredActivities: ["Cycling", "Rowing", "Pilates", "Running"],
      movementConsiderations: [
        "Keep knee discomfort at or below 3/10",
        "Favor controlled knee loading",
        "Progress running by symptoms",
      ],
      stopSignals: ["Knee swelling", "Giving way", "Sharp or worsening knee pain"],
      accessibilityNeeds: [],
    },
    documentTitles: [
      { title: "Digital Passport summary", kind: "clinical-summary" },
      { title: "Complete blood count", kind: "lab-report" },
      { title: "Iron studies and ferritin", kind: "lab-report" },
      { title: "Vitamin B12 and folate", kind: "lab-report" },
      { title: "Comprehensive metabolic panel", kind: "lab-report" },
      { title: "Basic thyroid profile", kind: "lab-report" },
      { title: "Right knee sports assessment", kind: "functional-assessment" },
      { title: "Adaptive Gym return-to-running guidance", kind: "care-guidance" },
    ],
  },
  {
    id: "passport_evelyn",
    displayName: "Evelyn Brooks Demo",
    dateOfBirth: "1958-03-08",
    biologicalSex: "female",
    pronouns: "she/her",
    heightCm: 161,
    weightKg: 67.2,
    bloodPressure: "126/76",
    restingHeartRate: 68,
    conditions: [
      {
        id: "osteopenia",
        label: "Osteopenia",
        status: "monitoring",
        severity: "mild",
        onsetYear: 2024,
      },
      {
        id: "knee_oa",
        label: "Mild bilateral knee osteoarthritis",
        status: "controlled",
        severity: "mild",
        onsetYear: 2022,
      },
      {
        id: "hypertension",
        label: "Essential hypertension",
        status: "controlled",
        severity: "mild",
        onsetYear: 2019,
      },
    ],
    medications: [{ id: "amlodipine", name: "Amlodipine", dose: "5 mg", schedule: "Once daily" }],
    results: [
      {
        code: "femoral_tscore",
        label: "Femoral neck T-score",
        value: -1.8,
        unit: "SD",
        interpretation: "low",
        low: -1,
      },
      {
        code: "vitamin_d",
        label: "25-OH vitamin D",
        value: 28,
        unit: "ng/mL",
        interpretation: "normal",
        low: 20,
      },
      {
        code: "a1c",
        label: "Hemoglobin A1c",
        value: 5.5,
        unit: "%",
        interpretation: "normal",
        high: 5.6,
      },
    ],
    functional: {
      experienceLevel: "beginner",
      weeklyActivityMinutes: 120,
      preferredSessionMinutes: 40,
      goals: ["Preserve bone and muscle", "Improve balance", "Stay independent"],
      preferredActivities: [
        "Walking",
        "Recumbent cycling",
        "Supported strength",
        "Balance practice",
      ],
      movementConsiderations: [
        "Use stable support for balance work",
        "Prefer low-impact cardio",
        "Progress resistance gradually",
      ],
      stopSignals: [
        "New severe back or hip pain",
        "Dizziness",
        "Loss of balance",
        "Chest pressure",
      ],
      accessibilityNeeds: [
        "Stable handhold near transitions",
        "Equipment with easy entry and exit",
      ],
    },
    documentTitles: [
      { title: "Digital Passport summary", kind: "clinical-summary" },
      { title: "Complete blood count", kind: "lab-report" },
      { title: "Comprehensive metabolic panel", kind: "lab-report" },
      { title: "Lipid panel", kind: "lab-report" },
      { title: "Bone health panel", kind: "lab-report" },
      { title: "DXA summary", kind: "imaging" },
      { title: "Mobility and fall-risk assessment", kind: "functional-assessment" },
      { title: "Adaptive Gym healthy-aging guidance", kind: "care-guidance" },
    ],
  },
  {
    id: "passport_michael",
    displayName: "Michael Roberts Demo",
    dateOfBirth: "1987-10-02",
    biologicalSex: "male",
    pronouns: "he/him",
    heightCm: 183,
    weightKg: 84.1,
    bloodPressure: "122/76",
    restingHeartRate: 64,
    conditions: [
      {
        id: "lumbar_discectomy",
        label: "L4-L5 microdiscectomy",
        status: "resolved",
        severity: "moderate",
        onsetYear: 2023,
      },
      {
        id: "foot_paresthesia",
        label: "Stable residual left-foot paresthesia",
        status: "monitoring",
        severity: "mild",
        onsetYear: 2023,
      },
    ],
    results: [
      {
        code: "fasting_glucose",
        label: "Fasting glucose",
        value: 89,
        unit: "mg/dL",
        interpretation: "normal",
        high: 99,
      },
      {
        code: "creatinine",
        label: "Creatinine",
        value: 0.96,
        unit: "mg/dL",
        interpretation: "normal",
        high: 1.3,
      },
      {
        code: "hemoglobin",
        label: "Hemoglobin",
        value: 15,
        unit: "g/dL",
        interpretation: "normal",
        low: 13.5,
      },
    ],
    functional: {
      experienceLevel: "intermediate",
      weeklyActivityMinutes: 140,
      preferredSessionMinutes: 50,
      goals: [
        "Rebuild posterior-chain strength",
        "Increase trunk endurance",
        "Return to confident lifting",
      ],
      preferredActivities: ["Cable training", "Supported rowing", "Walking", "Guided machines"],
      movementConsiderations: [
        "Use a controlled hip hinge",
        "Keep spine neutral under load",
        "Avoid fatigue-driven technique breakdown",
      ],
      stopSignals: [
        "New leg weakness",
        "New saddle numbness",
        "Bowel or bladder changes",
        "Rapidly increasing radiating pain",
      ],
      accessibilityNeeds: [],
    },
    documentTitles: [
      { title: "Digital Passport summary", kind: "clinical-summary" },
      { title: "Complete blood count", kind: "lab-report" },
      { title: "Comprehensive metabolic panel", kind: "lab-report" },
      { title: "Cardiometabolic profile", kind: "lab-report" },
      { title: "Complete urinalysis", kind: "lab-report" },
      { title: "Lumbar neurological examination", kind: "clinical-summary" },
      { title: "Physical therapy functional assessment", kind: "functional-assessment" },
      { title: "Adaptive Gym spine-aware guidance", kind: "care-guidance" },
    ],
  },
  {
    id: "passport_amina",
    displayName: "Amina Okafor Demo",
    dateOfBirth: "1993-08-22",
    biologicalSex: "female",
    pronouns: "she/her",
    heightCm: 170,
    weightKg: 65.5,
    bloodPressure: "114/70",
    restingHeartRate: 61,
    conditions: [
      {
        id: "transtibial_amputation",
        label: "Right transtibial amputation",
        status: "controlled",
        severity: "moderate",
        onsetYear: 2018,
      },
      {
        id: "exercise_bronchoconstriction",
        label: "Exercise-induced bronchoconstriction",
        status: "controlled",
        severity: "mild",
        onsetYear: 2017,
      },
    ],
    medications: [
      {
        id: "albuterol",
        name: "Albuterol inhaler",
        dose: "As prescribed",
        schedule: "Before exercise when directed",
      },
    ],
    allergies: [
      {
        id: "latex",
        substance: "Natural rubber latex",
        reaction: "Contact dermatitis",
        severity: "mild",
      },
    ],
    results: [
      {
        code: "fev1",
        label: "Pre-bronchodilator FEV1",
        value: 91,
        unit: "% predicted",
        interpretation: "normal",
        low: 80,
      },
      {
        code: "fev1_change",
        label: "Post-bronchodilator FEV1 change",
        value: 8,
        unit: "%",
        interpretation: "informational",
      },
      {
        code: "a1c",
        label: "Hemoglobin A1c",
        value: 5.1,
        unit: "%",
        interpretation: "normal",
        high: 5.6,
      },
    ],
    functional: {
      experienceLevel: "advanced",
      weeklyActivityMinutes: 230,
      preferredSessionMinutes: 55,
      goals: [
        "Build whole-body strength",
        "Improve unilateral control",
        "Maintain aerobic capacity",
      ],
      preferredActivities: ["Rowing", "Cycling", "Cable training", "Seated strength"],
      movementConsiderations: [
        "Allow a progressive respiratory warm-up",
        "Check socket comfort during longer sessions",
        "Offer seated alternatives",
      ],
      stopSignals: [
        "Wheezing that does not settle",
        "Chest tightness",
        "Skin pain or breakdown at the socket",
        "Dizziness",
      ],
      accessibilityNeeds: [
        "Clear routes at least 90 cm wide",
        "Stable bench near training stations",
        "Space for prosthetic adjustments",
      ],
    },
    documentTitles: [
      { title: "Digital Passport summary", kind: "clinical-summary" },
      { title: "Complete blood count", kind: "lab-report" },
      { title: "Comprehensive metabolic panel", kind: "lab-report" },
      { title: "Cardiometabolic profile", kind: "lab-report" },
      { title: "Complete urinalysis", kind: "lab-report" },
      { title: "Pre/post bronchodilator spirometry", kind: "clinical-summary" },
      { title: "Prosthetic functional assessment", kind: "functional-assessment" },
      { title: "Adaptive Gym accessibility guidance", kind: "care-guidance" },
    ],
  },
];

export const demoPassports = seeds.map(buildPassport);

const ageBandByPassportId = {
  passport_mateo: "18-29",
  passport_daniel: "45-64",
  passport_maya: "30-44",
  passport_evelyn: "65+",
  passport_michael: "30-44",
  passport_amina: "30-44",
} as const;

export const demoGymProfiles = GymContextProjectionSchema.array()
  .length(6)
  .parse(
    demoPassports.map((passport, index) => ({
      projectionId: `gym_${passport.id}`,
      subjectAlias: `Participant ${String(index + 1).padStart(2, "0")}`,
      ageBand: ageBandByPassportId[passport.id as keyof typeof ageBandByPassportId],
      goals: passport.functional.goals,
      experienceLevel: passport.functional.experienceLevel,
      preferredSessionMinutes: passport.functional.preferredSessionMinutes,
      preferredActivities: passport.functional.preferredActivities,
      movementConsiderations: passport.functional.movementConsiderations,
      stopSignals: passport.functional.stopSignals,
      accessibilityNeeds: passport.functional.accessibilityNeeds,
      issuedAt: "2026-08-20T18:00:00.000Z",
      expiresAt: "2026-11-20T18:00:00.000Z",
      synthetic: true,
    })),
  );

export const demoAccessGrants = AccessGrantSchema.array().parse([
  {
    id: "grant_mateo_clinic",
    passportId: "passport_mateo",
    granteeId: "clinician_elena",
    granteeType: "clinician",
    scopes: ["passport.summary.read", "passport.clinical.read", "passport.documents.read"],
    status: "active",
    purpose: "Review the synthetic participant's wellness overview",
    issuedAt: "2026-08-20T18:00:00.000Z",
    expiresAt: "2026-11-20T18:00:00.000Z",
  },
  {
    id: "grant_maya_clinic",
    passportId: "passport_maya",
    granteeId: "clinician_elena",
    granteeType: "clinician",
    scopes: ["passport.summary.read", "passport.clinical.read", "passport.guidance.write"],
    status: "active",
    purpose: "Coordinate synthetic return-to-running guidance",
    issuedAt: "2026-08-20T18:00:00.000Z",
    expiresAt: "2026-10-20T18:00:00.000Z",
  },
]);
