import { defineConfig, devices } from "@playwright/test";

const passportBaseUrl = process.env.PASSPORT_BASE_URL ?? "http://127.0.0.1:3000";
const gymBaseUrl = process.env.GYM_BASE_URL ?? "http://127.0.0.1:3001";
const usesExternalServers = Boolean(process.env.PASSPORT_BASE_URL && process.env.GYM_BASE_URL);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 2,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  metadata: { passportBaseUrl, gymBaseUrl },
  webServer: usesExternalServers
    ? undefined
    : [
        {
          command:
            "CI=true pnpm --filter @adaptive-world/passport exec next dev --turbopack --hostname 127.0.0.1 --port 3000",
          url: passportBaseUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
        {
          command:
            "CI=true pnpm --filter @adaptive-world/gym exec next dev --turbopack --hostname 127.0.0.1 --port 3001",
          url: gymBaseUrl,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      ],
});
