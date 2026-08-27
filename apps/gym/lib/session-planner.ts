import type { Equipment, GeneratedSession, GymContextProjection } from "@adaptive-world/contracts";

type DraftInput = {
  profile: GymContextProjection;
  equipment: Equipment[];
  goal: string;
  durationMinutes: number;
  equipmentIds?: string[];
};

const strengthCategories = new Set([
  "selectorized-strength",
  "plate-loaded-strength",
  "free-weights",
  "functional-training",
]);

export function createGroundedSession({
  profile,
  equipment,
  goal,
  durationMinutes,
  equipmentIds = [],
}: DraftInput): GeneratedSession {
  const available = equipment.filter((item) => item.available);
  const context = [...profile.movementConsiderations, ...profile.accessibilityNeeds]
    .join(" ")
    .toLowerCase();
  const explicit = new Set(equipmentIds);

  const safe = available.filter((item) => {
    const text = [item.name, ...item.capabilities, ...item.suitabilityTags].join(" ").toLowerCase();
    if (
      context.includes("overhead") &&
      (text.includes("overhead") || item.name.toLowerCase().includes("shoulder press"))
    )
      return false;
    if (
      (context.includes("knee") || context.includes("patellofemoral")) &&
      (text.includes("stair") || text.includes("hack squat"))
    )
      return false;
    if (
      (context.includes("spine") || context.includes("lumbar")) &&
      (text.includes("trunk flexion") || text.includes("torso rotation"))
    )
      return false;
    return true;
  });

  const goalText = goal.toLowerCase();
  function relevance(item: Equipment) {
    let score = explicit.has(item.id) ? 100 : 0;
    const text = [item.name, item.summary, ...item.capabilities, ...item.suitabilityTags]
      .join(" ")
      .toLowerCase();
    if (goalText.includes("cardio") || goalText.includes("run") || goalText.includes("endurance"))
      score += item.category === "cardio" ? 18 : 0;
    if (goalText.includes("strength") || goalText.includes("muscle"))
      score += strengthCategories.has(item.category) ? 16 : 0;
    if (goalText.includes("mobility") || goalText.includes("balance"))
      score += item.category === "pilates-mobility" || item.category === "rehabilitation" ? 17 : 0;
    if (goalText.includes("full") || goalText.includes("general"))
      score += item.capabilities.some((capability) => capability.toLowerCase().includes("multi"))
        ? 10
        : 0;
    if (profile.accessibilityNeeds.length > 0) score += item.accessibility.length * 2;
    if (
      profile.preferredActivities.some((activity) =>
        text.includes(activity.toLowerCase().split(" ")[0] ?? ""),
      )
    )
      score += 7;
    score += Math.max(0, 6 - (Number.parseInt(item.id.replace(/\D/g, ""), 10) % 7));
    return score;
  }

  const ordered = [...safe].sort((a, b) => relevance(b) - relevance(a));
  const selected: Equipment[] = [];
  for (const item of ordered) {
    if (selected.length >= 5) break;
    if (
      selected.some((picked) => picked.category === item.category) &&
      !explicit.has(item.id) &&
      selected.length < 3
    )
      continue;
    selected.push(item);
  }
  if (selected.length === 0)
    throw new Error("No available equipment matches the active constraints.");

  const warmup = Math.max(5, Math.round(durationMinutes * 0.15));
  const coolDown = Math.max(4, Math.round(durationMinutes * 0.1));
  const working = Math.max(1, durationMinutes - warmup - coolDown);
  const perItem = Math.max(3, Math.floor(working / selected.length));

  return {
    id: `session_${Date.now()}`,
    projectionId: profile.projectionId,
    title: `${goal} · Adaptive draft`,
    goal,
    durationMinutes,
    status: "draft",
    exercises: selected.map((item, index) => ({
      equipmentId: item.id,
      name: item.name,
      durationMinutes: item.category === "cardio" ? perItem : undefined,
      sets: item.category === "cardio" ? undefined : 2 + (index % 2),
      reps: item.category === "cardio" ? undefined : "8–12 controlled reps",
      intensity: index === 0 ? "easy" : "moderate",
      instructions: [
        index === 0
          ? `Begin after a ${warmup}-minute gradual warm-up.`
          : "Use a load that preserves smooth, repeatable technique.",
        "Stop the set with two or more comfortable repetitions still available.",
      ],
      adaptationReason: explicit.has(item.id)
        ? "You explicitly selected this available catalog item."
        : `Matched to ${goal.toLowerCase()} using this equipment's recorded capabilities.`,
    })),
    safetyNotes: [
      ...profile.movementConsiderations.slice(0, 3),
      ...profile.stopSignals.slice(0, 2),
      `Reserve about ${coolDown} minutes for a gradual cool-down.`,
    ],
    createdAt: new Date().toISOString(),
  };
}
