import { equipmentCatalog } from "@adaptive-world/demo-data";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().toLowerCase();
  const category = searchParams.get("category");
  const results = equipmentCatalog.filter(
    (item) =>
      (!category || item.category === category) &&
      (!query ||
        [item.name, item.summary, ...item.capabilities, ...item.suitabilityTags]
          .join(" ")
          .toLowerCase()
          .includes(query)),
  );
  return Response.json(
    { count: results.length, equipment: results },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  );
}
