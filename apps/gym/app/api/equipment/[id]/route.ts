import { equipmentCatalog } from "@adaptive-world/demo-data";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = equipmentCatalog.find((entry) => entry.id === id || entry.slug === id);
  if (!item)
    return Response.json(
      {
        ok: false,
        error: { code: "NOT_FOUND", message: "Equipment not found.", retryable: false },
        requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  return Response.json(
    {
      ok: true,
      data: { equipment: item },
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    },
    { headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
  );
}
