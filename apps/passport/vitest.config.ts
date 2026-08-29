import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    env: {
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/adaptive_world_test",
      BETTER_AUTH_SECRET: "adaptive-world-test-secret-at-least-thirty-two-characters",
    },
  },
});
