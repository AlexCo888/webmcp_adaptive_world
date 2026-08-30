import { describe, expect, it } from "vitest";
import { normalizePostgresConnectionUrl } from "../src";

describe("PostgreSQL connection URL normalization", () => {
  it.each(["prefer", "require", "verify-ca"])(
    "makes the current certificate-verifying behavior explicit for sslmode=%s",
    (sslMode) => {
      expect(
        normalizePostgresConnectionUrl(
          `postgresql://demo:secret@database.example.test/adaptive?sslmode=${sslMode}&channel_binding=require`,
        ),
      ).toBe(
        "postgresql://demo:secret@database.example.test/adaptive?sslmode=verify-full&channel_binding=require",
      );
    },
  );

  it.each(["verify-full", "disable", "no-verify"])(
    "preserves an explicit sslmode=%s",
    (sslMode) => {
      const databaseUrl = `postgresql://demo:secret@database.example.test/adaptive?sslmode=${sslMode}`;
      expect(normalizePostgresConnectionUrl(databaseUrl)).toBe(databaseUrl);
    },
  );

  it("preserves a local URL without SSL parameters", () => {
    const databaseUrl = "postgresql://test:test@127.0.0.1:5432/adaptive_world_test";
    expect(normalizePostgresConnectionUrl(databaseUrl)).toBe(databaseUrl);
  });

  it("rejects non-PostgreSQL URLs", () => {
    expect(() => normalizePostgresConnectionUrl("https://database.example.test")).toThrow(
      TypeError,
    );
  });
});
