import type { GymContext } from "./types";

export const gymContexts: GymContext[] = [
  {
    id: "mateo-rivera",
    label: "Mateo · General fitness",
    ageRange: "25–34",
    goals: ["Build general strength", "Improve mobility", "Run a comfortable 5K"],
    preferences: ["Clear machine instructions", "Free weights", "Incline walking", "Pilates"],
    considerations: [
      "Occasional mild right-shoulder tightness",
      "Hamstring stiffness after sitting",
    ],
    avoid: ["Maximal unsupervised lifts", "High-volume overhead work"],
    stopSignals: ["Chest pain", "Faintness", "Disproportionate breathlessness", "New sharp pain"],
    sessionMinutes: 55,
    validUntil: "2026-09-30T23:59:59.000Z",
  },
  {
    id: "daniel-martinez",
    label: "Daniel · Cardiometabolic",
    ageRange: "45–54",
    goals: ["Improve aerobic capacity", "Build sustainable strength", "Support healthy habits"],
    preferences: ["Low-impact cardio", "Selectorized strength", "Measured progressions"],
    considerations: ["Gradual warm-up", "Use conversational effort for cardio"],
    avoid: ["Breath-holding under load", "Max-effort intervals", "Unsupervised one-rep maximums"],
    stopSignals: ["Chest pressure", "Severe headache", "Dizziness", "Unusual shortness of breath"],
    sessionMinutes: 45,
    validUntil: "2026-09-30T23:59:59.000Z",
  },
  {
    id: "maya-chen",
    label: "Maya · Runner support",
    ageRange: "25–34",
    goals: [
      "Return to comfortable running",
      "Strengthen hips and quadriceps",
      "Maintain endurance",
    ],
    preferences: ["Cycling", "Rowing", "Pilates", "Symptom-guided progressions"],
    considerations: [
      "Mild right patellofemoral discomfort",
      "Keep knee discomfort at or below 3/10",
    ],
    avoid: ["Deep loaded knee flexion if symptomatic", "Sharp increases in running volume"],
    stopSignals: [
      "Knee locking",
      "Giving way",
      "Swelling",
      "Pain that escalates during the session",
    ],
    sessionMinutes: 50,
    validUntil: "2026-09-30T23:59:59.000Z",
  },
  {
    id: "evelyn-brooks",
    label: "Evelyn · Healthy aging",
    ageRange: "65–74",
    goals: ["Preserve bone and muscle", "Improve balance", "Stay independent"],
    preferences: ["Stable supports", "Low-impact cardio", "Simple progressions"],
    considerations: ["Use stable hand support for balance", "Mild knee osteoarthritis"],
    avoid: [
      "Unsupported unstable surfaces",
      "High-impact jumping",
      "Deep knee flexion when painful",
    ],
    stopSignals: ["Loss of balance", "Sudden joint pain", "Chest symptoms", "New dizziness"],
    sessionMinutes: 40,
    validUntil: "2026-09-30T23:59:59.000Z",
  },
  {
    id: "michael-roberts",
    label: "Michael · Back-conscious strength",
    ageRange: "35–44",
    goals: ["Rebuild posterior-chain strength", "Increase work capacity", "Move confidently"],
    preferences: ["Cable stations", "Guided machines", "Technique-focused rowing"],
    considerations: ["Neutral-spine hinge pattern", "Stable mild foot sensation change"],
    avoid: ["Repeated loaded spinal flexion", "Ballistic twisting", "Fatigued technique breakdown"],
    stopSignals: [
      "New weakness",
      "Increasing leg symptoms",
      "Saddle numbness",
      "Bowel or bladder change",
    ],
    sessionMinutes: 50,
    validUntil: "2026-09-30T23:59:59.000Z",
  },
  {
    id: "amina-okafor",
    label: "Amina · Accessible conditioning",
    ageRange: "25–34",
    goals: ["Build full-body strength", "Maintain conditioning", "Train independently"],
    preferences: ["Rowing", "Cycling", "Cable training", "Clear transfer space"],
    considerations: [
      "Right transtibial prosthesis",
      "Longer gradual warm-up",
      "Stable bench nearby",
    ],
    avoid: [
      "Congested routes",
      "Repeated high-impact loading",
      "Training through socket discomfort",
    ],
    stopSignals: [
      "Wheezing not settling with the action plan",
      "Socket pain",
      "Skin irritation",
      "Dizziness",
    ],
    sessionMinutes: 50,
    validUntil: "2026-09-30T23:59:59.000Z",
  },
];

export function getGymContext(id: string) {
  return gymContexts.find((context) => context.id === id);
}
