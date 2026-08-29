import { equipmentCatalog } from "@adaptive-world/demo-data";
import { matchesEquipmentSearch } from "@/lib/equipment-search";

export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? undefined;
  const category = searchParams.get("category");
  const results = equipmentCatalog.filter((item) =>
    matchesEquipmentSearch(item, {
      query,
      ...(category ? { category } : {}),
    }),
  );
  return Response.json(
    {
      ok: true,
      data: { count: results.length, equipment: results },
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
    { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );
}
