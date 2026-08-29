import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./http";

describe("commerce same-origin enforcement", () => {
  it("uses the configured public origin instead of the reverse-proxy request URL", () => {
    const request = new Request("http://localhost:3001/api/commerce", {
      headers: { origin: "http://127.0.0.1:3001" },
    });
    expect(() => assertSameOrigin(request, "http://127.0.0.1:3001/path")).not.toThrow();
  });

  it("rejects missing and mismatched origins", () => {
    expect(() =>
      assertSameOrigin(new Request("http://localhost:3001/api/commerce"), "https://gym.example"),
    ).toThrow(/invalid/u);
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3001/api/commerce", {
          headers: { origin: "https://attacker.example" },
        }),
        "https://gym.example",
      ),
    ).toThrow(/invalid/u);
  });
});
