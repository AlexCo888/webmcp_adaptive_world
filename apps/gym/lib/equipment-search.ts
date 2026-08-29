import type { Equipment } from "@adaptive-world/contracts";

export type EquipmentSearchCriteria = Readonly<{
  query?: string;
  category?: string;
  categories?: readonly string[];
  maxWidthCm?: number;
  maxDepthCm?: number;
  accessibleOnly?: boolean;
  availableOnly?: boolean;
}>;

const GENERIC_EQUIPMENT_TERMS = new Set(["equipment", "machine", "machines"]);
const ACCESSIBILITY_TERMS = new Set(["accessible", "accessibility"]);
const EQUIPMENT_TERM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  rower: ["rowing"],
  rowers: ["rowing"],
};

function matchesSearchTerm(searchableText: string, term: string): boolean {
  return [term, ...(EQUIPMENT_TERM_ALIASES[term] ?? [])].some((candidate) =>
    searchableText.includes(candidate),
  );
}

function searchableEquipmentText(item: Equipment): string {
  const categoryText =
    item.category === "functional-training"
      ? "functional training functional trainer"
      : item.category.replaceAll("-", " ");
  return [
    item.name,
    item.manufacturer,
    item.model,
    categoryText,
    item.summary,
    ...item.capabilities,
    ...item.accessibility,
    ...item.suitabilityTags,
  ]
    .join(" ")
    .toLowerCase();
}

export function matchesEquipmentSearch(
  item: Equipment,
  criteria: EquipmentSearchCriteria,
): boolean {
  const spaceDimensions = item.operatingDimensionsCm ?? item.dimensionsCm;
  const queryTerms = criteria.query?.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const requiresAccessibility = queryTerms.some((term) => ACCESSIBILITY_TERMS.has(term));
  const meaningfulQueryTerms = queryTerms.filter(
    (term) => !GENERIC_EQUIPMENT_TERMS.has(term) && !ACCESSIBILITY_TERMS.has(term),
  );
  if (criteria.category && item.category !== criteria.category) return false;
  if (criteria.categories?.length && !criteria.categories.includes(item.category)) return false;
  if (criteria.maxWidthCm && spaceDimensions.width > criteria.maxWidthCm) return false;
  if (criteria.maxDepthCm && spaceDimensions.length > criteria.maxDepthCm) return false;
  if (criteria.accessibleOnly && item.accessibility.length === 0) return false;
  if (requiresAccessibility && item.accessibility.length === 0) return false;
  if (criteria.availableOnly && !item.available) return false;
  const searchableText = searchableEquipmentText(item);
  return meaningfulQueryTerms.every((term) => matchesSearchTerm(searchableText, term));
}
