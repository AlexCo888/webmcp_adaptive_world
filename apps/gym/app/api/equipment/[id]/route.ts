import { equipmentCatalog } from "@adaptive-world/demo-data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = equipmentCatalog.find((entry) => entry.id === id || entry.slug === id);
  if (!item) return Response.json({ error: "Equipment not found." }, { status: 404 });
  return Response.json(
    { equipment: item },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=900" } },
  );
}
