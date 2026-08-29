import { WebMCPToolError } from "@adaptive-world/webmcp";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readPassportApiResponse } from "./api-client";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("Passport protected API client", () => {
  it("accepts only a valid success envelope and expected data shape", async () => {
    const response = jsonResponse({
      ok: true,
      data: { saved: true },
      meta: {
        synthetic: true,
        asOf: "2026-08-29T09:00:00.000Z",
        requestId: "request-1",
      },
    });
    await expect(
      readPassportApiResponse(response, z.object({ saved: z.literal(true) }).strict(), "failed"),
    ).resolves.toEqual({ saved: true });
  });

  it("preserves stable safe server errors across the WebMCP boundary", async () => {
    const response = jsonResponse(
      {
        ok: false,
        error: { code: "FORBIDDEN", message: "This action is not authorized." },
        meta: { requestId: "request-2" },
      },
      403,
    );
    const execution = readPassportApiResponse(
      response,
      z.object({ saved: z.literal(true) }),
      "failed",
    );
    await expect(execution).rejects.toBeInstanceOf(WebMCPToolError);
    await expect(execution).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects unexpected content types and success payloads", async () => {
    const html = new Response("<html>login</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    await expect(readPassportApiResponse(html, z.unknown(), "failed")).rejects.toMatchObject({
      code: "UNAVAILABLE",
    });

    const malformed = jsonResponse({ ok: true, data: { saved: false }, meta: {} });
    await expect(
      readPassportApiResponse(malformed, z.object({ saved: z.literal(true) }), "failed"),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
  });
});
