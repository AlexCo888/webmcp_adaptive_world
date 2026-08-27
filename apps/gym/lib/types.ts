export type EquipmentCategory =
  "Cardio" | "Strength" | "Functional" | "Mobility" | "Pilates" | "Recovery";

export type EquipmentItem = {
  id: string;
  slug: string;
  name: string;
  brand: string;
  model: string;
  category: EquipmentCategory;
  movementPattern: string;
  description: string;
  imageUrl?: string;
  footprint: { widthM: number; depthM: number; heightM: number };
  accessibility: string[];
  features: string[];
  targetAreas: string[];
  experienceLevel: "Beginner" | "Intermediate" | "Advanced" | "All levels";
};

export type GymContext = {
  id: string;
  label: string;
  ageRange: string;
  goals: string[];
  preferences: string[];
  considerations: string[];
  avoid: string[];
  stopSignals: string[];
  sessionMinutes: number;
  validUntil: string;
};

export type SessionExercise = {
  equipmentId: string;
  equipmentName: string;
  movement: string;
  durationMinutes: number;
  prescription: string;
  coaching: string;
  rationale: string;
};

export type SessionDraft = {
  id: string;
  title: string;
  durationMinutes: number;
  focus: string;
  safetyNote: string;
  exercises: SessionExercise[];
};
